package com.romatur.woodland.review

import android.app.Activity
import android.app.DatePickerDialog
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.pdf.PdfDocument
import android.media.ExifInterface
import android.net.Uri
import android.provider.MediaStore
import android.print.PrintAttributes
import android.print.PrintManager
import android.util.Base64
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import kotlin.math.max

/** Device-only boundary. No credentials, source photo paths, or arbitrary file reads cross JS. */
class WoodlandDeviceModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newSingleThreadExecutor()
  private val preferences = context.getSharedPreferences("woodland_identity", Context.MODE_PRIVATE)
  private val photos = File(context.filesDir, "woodland/photos").apply { mkdirs() }
  private val reports = File(context.filesDir, "woodland/reports").apply { mkdirs() }
  private val photoStore = OwnedAssetStore(photos, 128L * 1024 * 1024, DeviceRules::validPhotoName)
  private val reportStore = OwnedAssetStore(reports, 64L * 1024 * 1024, DeviceRules::validPdfName)
  private val captures = File(context.cacheDir, "woodland-capture").apply { mkdirs() }
  private var unlocked: Boolean
    get() = sessionUnlocked
    set(value) {
      sessionUnlocked = value
      if (!value) UiThreadUtil.runOnUiThread { ReportViewerActivity.closeOpenViewer() }
    }
  @Volatile private var invalidated = false
  @Volatile private var captureBusy = false
  private var pendingCapture: Capture? = null
  private var dateDialog: DatePickerDialog? = null
  private var datePromise: Promise? = null

  private data class Capture(val file: File, val uri: Uri, val promise: Promise)
  private class DeviceFailure(val code: String, message: String) : Exception(message)

  private val listener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != CAMERA_REQUEST) return
      val capture = pendingCapture ?: return
      pendingCapture = null
      context.revokeUriPermission(capture.uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      if (resultCode != Activity.RESULT_OK) {
        capture.file.delete()
        captureBusy = false
        capture.promise.resolve(null)
        return
      }
      run(capture.promise, cleanup = { capture.file.delete(); captureBusy = false }) {
        requireUnlocked()
        capture.promise.resolve(importCapture(capture.file))
      }
    }
  }

  init {
    unlocked = false
    // A killed process cannot resume its JS Promise. Remove only our abandoned temp captures.
    captures.listFiles()?.filter { it.isFile }?.forEach { it.delete() }
    photos.listFiles()?.filter { it.isFile && it.name.startsWith("import_") }?.forEach { it.delete() }
    context.addActivityEventListener(listener)
  }

  override fun getName() = "WoodlandDevice"

  private fun run(promise: Promise, cleanup: () -> Unit = {}, action: () -> Unit) {
    if (invalidated) { cleanup(); promise.reject("E_CLOSED", "Сеанс устройства завершён."); return }
    try {
      worker.execute {
        try {
          if (invalidated) throw DeviceFailure("E_CLOSED", "Сеанс устройства завершён.")
          action()
        } catch (failure: DeviceFailure) {
          promise.reject(failure.code, failure.message)
        } catch (_: AssetStorageFull) {
          promise.reject("E_STORAGE_FULL", "Достигнут предел хранилища фото или отчётов на планшете.")
        } catch (_: Exception) {
          // Never expose credential material or arbitrary paths in native exception messages.
          promise.reject("E_DEVICE", "Не удалось выполнить действие на устройстве. Повторите попытку.")
        } finally { cleanup() }
      }
    } catch (_: RejectedExecutionException) {
      cleanup()
      promise.reject("E_CLOSED", "Сеанс устройства завершён.")
    }
  }

  private fun requireUnlocked() {
    if (!unlocked) throw DeviceFailure("E_LOCKED", "Сначала войдите с PIN-кодом инспектора.")
  }

  private fun identity(name: String): WritableMap = Arguments.createMap().apply { putString("name", name) }
  private fun checkPin(pin: String) {
    if (!pin.matches(Regex("[0-9]{6}"))) throw DeviceFailure("E_PIN_FORMAT", "PIN должен содержать ровно 6 цифр.")
  }

  private fun commit(editor: android.content.SharedPreferences.Editor) {
    if (!editor.commit()) throw DeviceFailure("E_STORAGE", "Не удалось сохранить профиль на устройстве.")
  }

  @ReactMethod fun getIdentity(promise: Promise) = run(promise) {
    val name = preferences.getString("name", null)
    promise.resolve(name?.let { identity(it) })
  }

  @ReactMethod fun createIdentity(name: String, pin: String, promise: Promise) = run(promise) {
    if (preferences.contains("name")) throw DeviceFailure("E_IDENTITY_EXISTS", "Профиль уже создан. Введите его PIN-код.")
    checkPin(pin)
    val trimmed = name.trim()
    if (trimmed.length !in 2..100 || trimmed.any { it.isISOControl() }) {
      throw DeviceFailure("E_NAME", "Укажите имя инспектора: от 2 до 100 символов.")
    }
    val salt = ByteArray(24).also { SecureRandom().nextBytes(it) }
    val digest = DeviceRules.derivePin(pin, salt, DeviceRules.PIN_ITERATIONS)
    try {
      commit(preferences.edit().putString("name", trimmed)
        .putString("salt", Base64.encodeToString(salt, Base64.NO_WRAP))
        .putString("digest", Base64.encodeToString(digest, Base64.NO_WRAP))
        .putInt("iterations", DeviceRules.PIN_ITERATIONS).putInt("failed", 0).putLong("lockedUntil", 0))
      unlocked = true
      promise.resolve(identity(trimmed))
    } finally { digest.fill(0); salt.fill(0) }
  }

  @ReactMethod fun unlock(pin: String, promise: Promise) = run(promise) {
    val name = preferences.getString("name", null) ?: throw DeviceFailure("E_NO_IDENTITY", "Сначала создайте профиль инспектора.")
    val now = System.currentTimeMillis()
    val attempts = DeviceRules.Attempts(preferences.getInt("failed", 0), preferences.getLong("lockedUntil", 0))
    if (DeviceRules.isLocked(attempts, now)) {
      val minutes = max(1, ((attempts.lockedUntil - now + 59999) / 60000).toInt())
      throw DeviceFailure("E_PIN_LOCKOUT", "Слишком много попыток. Повторите через $minutes мин.")
    }
    val salt = Base64.decode(preferences.getString("salt", ""), Base64.NO_WRAP)
    val expected = Base64.decode(preferences.getString("digest", ""), Base64.NO_WRAP)
    val iterations = preferences.getInt("iterations", DeviceRules.PIN_ITERATIONS)
    if (salt.size != 24 || expected.size != 32 || iterations != DeviceRules.PIN_ITERATIONS) {
      throw DeviceFailure("E_PROFILE_INVALID", "Профиль повреждён. Требуется восстановление данных приложения.")
    }
    val supplied = if (pin.matches(Regex("[0-9]{6}"))) DeviceRules.derivePin(pin, salt, iterations) else ByteArray(32)
    val valid = DeviceRules.matches(expected, supplied)
    salt.fill(0); expected.fill(0); supplied.fill(0)
    if (!valid) {
      unlocked = false
      val next = DeviceRules.failedAttempt(attempts, now)
      commit(preferences.edit().putInt("failed", next.count).putLong("lockedUntil", next.lockedUntil))
      if (next.lockedUntil > now) throw DeviceFailure("E_PIN_LOCKOUT", "5 неверных попыток. Вход заблокирован на 15 минут.")
      throw DeviceFailure("E_PIN_INVALID", "Неверный PIN-код. Осталось попыток: ${5 - next.count}.")
    }
    commit(preferences.edit().putInt("failed", 0).putLong("lockedUntil", 0))
    unlocked = true
    promise.resolve(identity(name))
  }

  @ReactMethod fun lock(promise: Promise) = run(promise) {
    unlocked = false
    UiThreadUtil.runOnUiThread { dateDialog?.cancel() }
    promise.resolve(null)
  }

  @ReactMethod fun capturePhoto(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        requireUnlocked()
        val activity = context.currentActivity ?: throw DeviceFailure("E_ACTIVITY", "Откройте приложение на планшете и повторите съёмку.")
        if (captureBusy) throw DeviceFailure("E_CAMERA_BUSY", "Дождитесь завершения предыдущей съёмки.")
        val file = File.createTempFile("capture_", ".jpg", captures)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.woodland.files", file)
        val capture = Capture(file, uri, promise)
        pendingCapture = capture
        captureBusy = true
        try {
          val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, uri)
            clipData = ClipData.newRawUri("Фото проверки", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
          }
          activity.startActivityForResult(intent, CAMERA_REQUEST)
        } catch (error: Exception) {
          pendingCapture = null
          captureBusy = false
          file.delete()
          context.revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
          if (error is ActivityNotFoundException) throw DeviceFailure("E_NO_CAMERA", "На устройстве нет приложения камеры. Установите или включите камеру.")
          throw DeviceFailure("E_CAMERA", "Не удалось открыть камеру. Проверьте доступность камеры на устройстве.")
        }
      } catch (failure: DeviceFailure) { promise.reject(failure.code, failure.message) }
      catch (_: Exception) { promise.reject("E_CAMERA", "Не удалось подготовить камеру. Проверьте свободное место.") }
    }
  }

  private fun decodeBounded(file: File, maxDimension: Int = 2048): Bitmap {
    if (!file.isFile || file.length() !in 1..MAX_IMAGE_BYTES) throw DeviceFailure("E_PHOTO", "Фотография отсутствует или слишком велика.")
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    if (bounds.outWidth !in 1..20000 || bounds.outHeight !in 1..20000 || bounds.outWidth.toLong() * bounds.outHeight > 100000000L) {
      throw DeviceFailure("E_PHOTO", "Камера вернула неподдерживаемую фотографию.")
    }
    return BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply {
      inSampleSize = DeviceRules.sampleSize(bounds.outWidth, bounds.outHeight, maxDimension)
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }) ?: throw DeviceFailure("E_PHOTO", "Не удалось прочитать фотографию.")
  }

  private fun importCapture(source: File): WritableMap {
    // Copy out of the provider-exposed capture directory before decoding. A camera
    // process might retain its open output descriptor after the URI grant is revoked.
    val staging = File.createTempFile("import_", ".jpg", photos)
    try {
      source.inputStream().use { input ->
        FileOutputStream(staging).use { output ->
          val buffer = ByteArray(8192)
          var total = 0L
          while (true) {
            val count = input.read(buffer)
            if (count == -1) break
            total += count
            if (total > MAX_IMAGE_BYTES) throw DeviceFailure("E_PHOTO", "Фотография слишком велика.")
            output.write(buffer, 0, count)
          }
        }
      }
      return encodeCapture(staging)
    } finally { staging.delete() }
  }

  private fun encodeCapture(source: File): WritableMap {
    var bitmap = decodeBounded(source)
    val target = File(photos, "photo_${UUID.randomUUID()}.jpg")
    try {
      val orientation = ExifInterface(source.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      val matrix = Matrix().apply {
        when (orientation) {
          ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
          ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
          ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
          ExifInterface.ORIENTATION_TRANSPOSE -> { setRotate(90f); postScale(-1f, 1f) }
          ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
          ExifInterface.ORIENTATION_TRANSVERSE -> { setRotate(270f); postScale(-1f, 1f) }
          ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(270f)
        }
      }
      if (!matrix.isIdentity) {
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        if (rotated !== bitmap) bitmap.recycle()
        bitmap = rotated
      }
      photoStore.write(target) { output ->
        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 88, output)) throw DeviceFailure("E_PHOTO", "Не удалось сохранить фотографию.")
      }
      // Encoding a new bitmap drops camera EXIF, GPS, thumbnails, and original filenames.
      return Arguments.createMap().apply {
        putString("fileName", target.name); putString("uri", Uri.fromFile(target).toString())
        putInt("width", bitmap.width); putInt("height", bitmap.height)
      }
    } finally { bitmap.recycle() }
  }

  @ReactMethod fun pickDate(initial: String, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        requireUnlocked()
        val activity = context.currentActivity ?: throw DeviceFailure("E_ACTIVITY", "Откройте приложение и повторите выбор даты.")
        if (dateDialog != null) throw DeviceFailure("E_DATE_BUSY", "Завершите выбор даты в открытом календаре.")
        val zone = TimeZone.getTimeZone("GMT+03:00")
        val today = Calendar.getInstance(zone)
        val selected = Calendar.getInstance(zone).apply {
          DeviceRules.parseDate(initial)?.let { time = it }
          if (after(today)) timeInMillis = today.timeInMillis
        }
        datePromise = promise
        val dialog = DatePickerDialog(activity, { _, year, month, day ->
          val value = String.format(Locale.ROOT, "%04d-%02d-%02d", year, month + 1, day)
          val last = String.format(Locale.ROOT, "%04d-%02d-%02d", today.get(Calendar.YEAR), today.get(Calendar.MONTH) + 1, today.get(Calendar.DAY_OF_MONTH))
          if (!unlocked) datePromise?.reject("E_LOCKED", "Сначала войдите с PIN-кодом инспектора.")
          else if (value > last) datePromise?.reject("E_DATE_FUTURE", "Дата обработки не может быть в будущем.")
          else datePromise?.resolve(value)
          datePromise = null
        }, selected.get(Calendar.YEAR), selected.get(Calendar.MONTH), selected.get(Calendar.DAY_OF_MONTH))
        // DatePicker interprets its bound in the tablet's timezone; match Moscow's calendar day.
        dialog.datePicker.maxDate = Calendar.getInstance().apply {
          set(today.get(Calendar.YEAR), today.get(Calendar.MONTH), today.get(Calendar.DAY_OF_MONTH), 23, 59, 59)
        }.timeInMillis
        dialog.setOnCancelListener { datePromise?.resolve(null); datePromise = null }
        dialog.setOnDismissListener { datePromise?.resolve(null); datePromise = null; dateDialog = null }
        dateDialog = dialog
        dialog.show()
      } catch (failure: DeviceFailure) { promise.reject(failure.code, failure.message) }
      catch (_: Exception) { datePromise = null; dateDialog = null; promise.reject("E_DATE", "Не удалось открыть календарь.") }
    }
  }

  private fun ownedPhoto(name: String): File = ownedFile(photos, name, DeviceRules.validPhotoName(name))
  private fun ownedReport(name: String): File = ownedFile(reports, name, DeviceRules.validPdfName(name))
  private fun ownedFile(directory: File, name: String, valid: Boolean): File {
    if (!valid) throw DeviceFailure("E_FILE", "Недопустимое имя вложения.")
    val file = File(directory, name)
    if (file.canonicalFile.parentFile != directory.canonicalFile || !file.isFile) {
      throw DeviceFailure("E_FILE", "Вложение отсутствует в хранилище приложения.")
    }
    return file
  }

  @ReactMethod fun createPdf(input: String, promise: Promise) = run(promise) {
    requireUnlocked()
    val content = try { ReportContent.parse(input) } catch (_: Exception) {
      throw DeviceFailure("E_REPORT", "Некорректный отчёт или превышены пределы PDF (не более 20 фото).")
    }
    val photoFiles = content.photos.associate { it.fileName to ownedPhoto(it.fileName) }
    val digest = MessageDigest.getInstance("SHA-256")
      .digest("woodland-a4-v1\n$input".toByteArray(Charsets.UTF_8))
      .joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }
    val target = File(reports, "pdf_$digest.pdf")
    reportStore.write(target) { output ->
      val document = PdfDocument()
      val writer = ReportDocumentWriter(document, content)
      try {
        writer.write { fileName -> decodeBounded(photoFiles.getValue(fileName), maxDimension = 1024) }
        document.writeTo(output)
      } finally { writer.finish(); document.close() }
    }
    promise.resolve(Arguments.createMap().apply {
      putString("fileName", target.name); putString("uri", Uri.fromFile(target).toString())
    })
  }

  @ReactMethod fun openReport(fileName: String, promise: Promise) = run(promise) {
    requireUnlocked()
    val file = ownedReport(fileName)
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.woodland.files", file)
    UiThreadUtil.runOnUiThread {
      try {
        requireUnlocked()
        val activity = context.currentActivity ?: throw DeviceFailure("E_ACTIVITY", "Откройте приложение, чтобы посмотреть отчёт.")
        // An explicit, private viewer works offline even on tablets without a PDF app.
        val view = Intent(context, ReportViewerActivity::class.java).apply {
          action = Intent.ACTION_VIEW
          setDataAndType(uri, "application/pdf")
          putExtra(ReportViewerActivity.EXTRA_FILE_NAME, file.name)
          clipData = ClipData.newRawUri("Отчёт проверки", uri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivity(view)
        promise.resolve(null)
      } catch (failure: DeviceFailure) { promise.reject(failure.code, failure.message) }
      catch (_: ActivityNotFoundException) { promise.reject("E_NO_VIEWER", "Просмотр PDF недоступен. Нажмите «Поделиться PDF», чтобы открыть отчёт в другом приложении.") }
      catch (_: Exception) { promise.reject("E_VIEW", "Не удалось открыть PDF. Повторите попытку или нажмите «Поделиться PDF».") }
    }
  }

  @ReactMethod fun shareReport(fileName: String, promise: Promise) = run(promise) {
    requireUnlocked()
    val file = ownedReport(fileName)
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.woodland.files", file)
    UiThreadUtil.runOnUiThread {
      try {
        requireUnlocked()
        val activity = context.currentActivity ?: throw DeviceFailure("E_ACTIVITY", "Откройте приложение, чтобы поделиться отчётом.")
        val send = Intent(Intent.ACTION_SEND).apply {
          type = "application/pdf"
          putExtra(Intent.EXTRA_STREAM, uri)
          clipData = ClipData.newRawUri("Отчёт проверки", uri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivity(Intent.createChooser(send, "Поделиться отчётом").apply {
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        })
        promise.resolve(null)
      } catch (failure: DeviceFailure) { promise.reject(failure.code, failure.message) }
      catch (_: ActivityNotFoundException) { promise.reject("E_NO_SHARE", "На устройстве нет приложений для передачи PDF.") }
      catch (_: Exception) { promise.reject("E_SHARE", "Не удалось открыть меню передачи отчёта.") }
    }
  }

  @ReactMethod fun printReport(fileName: String, promise: Promise) = run(promise) {
    requireUnlocked()
    val file = ownedReport(fileName)
    UiThreadUtil.runOnUiThread {
      try {
        requireUnlocked()
        val activity = context.currentActivity ?: throw DeviceFailure("E_ACTIVITY", "Откройте приложение, чтобы напечатать отчёт.")
        val manager = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager
          ?: throw DeviceFailure("E_NO_PRINT", "Системная печать недоступна на этом устройстве.")
        manager.print("Woodland · отчёт проверки", PdfPrintAdapter(file) { !invalidated && isSessionUnlocked() },
          PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4)
            .setColorMode(PrintAttributes.COLOR_MODE_COLOR).build())
        // Opening the OS dialog is the action. Only the user can submit a print job.
        promise.resolve(null)
      } catch (failure: DeviceFailure) { promise.reject(failure.code, failure.message) }
      catch (_: Exception) { promise.reject("E_PRINT", "Не удалось открыть системную печать отчёта.") }
    }
  }

  override fun invalidate() {
    invalidated = true
    unlocked = false
    context.removeActivityEventListener(listener)
    UiThreadUtil.runOnUiThread {
      dateDialog?.cancel()
      pendingCapture?.let {
        context.revokeUriPermission(it.uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        it.file.delete()
        it.promise.reject("E_CLOSED", "Сеанс съёмки завершён. Повторите съёмку.")
      }
      pendingCapture = null
      captureBusy = false
    }
    worker.shutdown()
    super.invalidate()
  }

  companion object {
    @Volatile private var sessionUnlocked = false
    internal fun isSessionUnlocked() = sessionUnlocked
    private const val CAMERA_REQUEST = 48021
    private const val MAX_IMAGE_BYTES = 64L * 1024 * 1024
  }
}
