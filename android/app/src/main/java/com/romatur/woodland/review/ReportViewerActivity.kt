package com.romatur.woodland.review

import android.app.Activity
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File
import java.lang.ref.WeakReference
import java.util.concurrent.Executors
import kotlin.math.roundToInt

/** Offline, app-private PDF viewing. Intent paths and foreign content URIs are never opened. */
class ReportViewerActivity : Activity() {
  private val worker = Executors.newSingleThreadExecutor()
  // Only the worker accesses the renderer; every page closes before the next job.
  private var renderer: PdfRenderer? = null
  private var reportUri: Uri? = null
  private var displayedBitmap: Bitmap? = null
  private lateinit var viewport: FrameLayout
  private lateinit var pageImage: ImageView
  private lateinit var pageScroll: ScrollView
  private lateinit var errorMessage: TextView
  private lateinit var counter: TextView
  private lateinit var previous: Button
  private lateinit var next: Button
  private lateinit var viewMode: Button
  private var currentPage = 0
  private var fitToWidth = true
  private var active = false
  @Volatile private var generation = 0

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    openViewer = WeakReference(this)
    if (!requireSession()) return
    currentPage = (savedInstanceState?.getInt(STATE_PAGE) ?: 0).coerceAtLeast(0)
    fitToWidth = savedInstanceState?.getBoolean(STATE_FIT_WIDTH, true) ?: true
    buildLayout()
    reportUri = try {
      val name = intent.getStringExtra(EXTRA_FILE_NAME) ?: throw IllegalArgumentException()
      if (!DeviceRules.validPdfName(name)) throw IllegalArgumentException()
      val directory = File(filesDir, "woodland/reports").canonicalFile
      val file = File(directory, name).canonicalFile
      if (file.parentFile != directory || !file.isFile) throw IllegalArgumentException()
      val ownedUri = FileProvider.getUriForFile(this, "$packageName.woodland.files", file)
      if (intent.action != Intent.ACTION_VIEW || intent.type != "application/pdf" || intent.data != ownedUri) {
        throw IllegalArgumentException()
      }
      ownedUri
    } catch (_: Exception) {
      showError()
      null
    }
  }

  private fun requireSession(): Boolean {
    if (WoodlandDeviceModule.isSessionUnlocked()) return true
    Toast.makeText(this, "Сначала войдите с PIN-кодом инспектора.", Toast.LENGTH_LONG).show()
    finish()
    return false
  }

  private fun buildLayout() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(SLATE)
    }
    ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }
    val header = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
    header.addView(button("Закрыть PDF") { finish() }, LinearLayout.LayoutParams(dp(160), dp(56)))
    header.addView(TextView(this).apply {
      text = "PDF-отчёт"
      textSize = 20f
      setTextColor(Color.WHITE)
      setTypeface(null, Typeface.BOLD)
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(24), 0, dp(24), 0)
    }, LinearLayout.LayoutParams(0, dp(56), 1f))
    viewMode = button(if (fitToWidth) "Вся страница" else "По ширине") {
      fitToWidth = !fitToWidth
      requestPage()
    }.apply { isEnabled = false }
    header.addView(viewMode, LinearLayout.LayoutParams(dp(160), dp(56)))
    root.addView(header, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56)))

    viewport = FrameLayout(this).apply {
      setBackgroundColor(Color.rgb(229, 240, 232))
      setPadding(dp(12), dp(8), dp(12), dp(8))
      addOnLayoutChangeListener { _, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
        if (right - left != oldRight - oldLeft || bottom - top != oldBottom - oldTop) requestPage()
      }
    }
    pageImage = ImageView(this).apply {
      scaleType = ImageView.ScaleType.FIT_CENTER
      contentDescription = "Страница PDF-отчёта"
    }
    pageScroll = ScrollView(this).apply {
      contentDescription = "Прокрутка PDF"
      isFillViewport = true
      overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
      addView(pageImage, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
    }
    viewport.addView(pageScroll, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    errorMessage = TextView(this).apply {
      visibility = View.GONE
      gravity = Gravity.CENTER
      textSize = 20f
      setTextColor(SLATE)
      setPadding(dp(32), dp(24), dp(32), dp(24))
      text = "Не удалось открыть PDF. Вернитесь к отчёту и нажмите «Поделиться PDF», чтобы открыть его в другом приложении."
    }
    viewport.addView(errorMessage, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    root.addView(viewport, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

    val navigation = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
    previous = button("Предыдущая") { currentPage--; requestPage() }.apply {
      contentDescription = "Предыдущая страница PDF"
      isEnabled = false
    }
    next = button("Следующая") { currentPage++; requestPage() }.apply {
      contentDescription = "Следующая страница PDF"
      isEnabled = false
    }
    counter = TextView(this).apply {
      contentDescription = "Номер страницы PDF"
      text = "Открываем PDF…"
      textSize = 16f
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    }
    navigation.addView(previous, LinearLayout.LayoutParams(dp(160), dp(56)))
    navigation.addView(counter, LinearLayout.LayoutParams(0, dp(56), 1f))
    navigation.addView(next, LinearLayout.LayoutParams(dp(160), dp(56)))
    root.addView(navigation, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56)))
    setContentView(root)
    WindowCompat.getInsetsController(window, root).isAppearanceLightStatusBars = false
    WindowCompat.getInsetsController(window, root).isAppearanceLightNavigationBars = false
  }

  private fun button(label: String, action: () -> Unit) = Button(this).apply {
    text = label
    textSize = 16f
    isAllCaps = false
    contentDescription = label
    minHeight = dp(56)
    setTextColor(ColorStateList(
      arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()),
      intArrayOf(Color.rgb(163, 189, 173), Color.WHITE)
    ))
    backgroundTintList = ColorStateList.valueOf(SLATE)
    setOnClickListener { if (requireSession()) action() }
  }

  override fun onStart() {
    super.onStart()
    active = true
    if (::viewport.isInitialized) viewport.post { requestPage() }
  }

  override fun onResume() {
    super.onResume()
    requireSession()
  }

  private fun requestPage() {
    if (!active || !::viewport.isInitialized || isFinishing || !requireSession()) return
    val uri = reportUri ?: return
    val width = viewport.width - viewport.paddingLeft - viewport.paddingRight
    val height = viewport.height - viewport.paddingTop - viewport.paddingBottom
    if (width <= 0 || height <= 0) return
    val requestedPage = currentPage
    val widthMode = fitToWidth
    val version = ++generation
    previous.isEnabled = false
    next.isEnabled = false
    viewMode.isEnabled = false
    worker.execute {
      if (version != generation || !WoodlandDeviceModule.isSessionUnlocked()) return@execute
      var bitmap: Bitmap? = null
      try {
        val document = renderer ?: run {
          val descriptor = contentResolver.openFileDescriptor(uri, "r") ?: throw IllegalStateException()
          try { PdfRenderer(descriptor).also { renderer = it } }
          catch (error: Exception) { descriptor.close(); throw error }
        }
        val count = document.pageCount
        val index = requestedPage.coerceIn(0, count - 1)
        var imageHeight = height
        document.openPage(index).use { page ->
          val layout = ReportPageLayout.calculate(page.width, page.height, width, height, widthMode)
          imageHeight = layout.displayHeight
          bitmap = Bitmap.createBitmap(layout.bitmapWidth, layout.bitmapHeight, Bitmap.Config.ARGB_8888)
          bitmap!!.eraseColor(Color.WHITE)
          page.render(bitmap!!, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        }
        val rendered = bitmap!!
        bitmap = null
        runOnUiThread {
          if (!active || isFinishing || version != generation || !WoodlandDeviceModule.isSessionUnlocked()) {
            rendered.recycle()
          } else {
            clearBitmap()
            displayedBitmap = rendered
            pageImage.layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, imageHeight)
            pageImage.setImageBitmap(rendered)
            pageScroll.post { if (active && version == generation) pageScroll.scrollTo(0, 0) }
            errorMessage.visibility = View.GONE
            currentPage = index
            counter.text = "Страница ${index + 1} из $count"
            pageImage.contentDescription = "Страница ${index + 1} из $count PDF-отчёта"
            previous.isEnabled = index > 0
            next.isEnabled = index + 1 < count
            viewMode.text = if (widthMode) "Вся страница" else "По ширине"
            viewMode.contentDescription = viewMode.text
            viewMode.isEnabled = true
          }
        }
      } catch (_: Exception) {
        bitmap?.recycle()
        closeDocument()
        runOnUiThread { if (active && !isFinishing && version == generation) showError() }
      } catch (_: OutOfMemoryError) {
        bitmap?.recycle()
        closeDocument()
        runOnUiThread { if (active && !isFinishing && version == generation) showError() }
      }
    }
  }

  private fun showError() {
    clearBitmap()
    errorMessage.visibility = View.VISIBLE
    counter.text = "PDF недоступен"
    previous.isEnabled = false
    next.isEnabled = false
    viewMode.isEnabled = false
  }

  private fun clearBitmap() {
    if (::pageImage.isInitialized) pageImage.setImageDrawable(null)
    displayedBitmap?.recycle()
    displayedBitmap = null
  }

  private fun closeDocument() {
    // PdfRenderer owns its descriptor and closes it together with the document.
    try { renderer?.close() } finally { renderer = null }
  }

  override fun onSaveInstanceState(outState: Bundle) {
    outState.putInt(STATE_PAGE, currentPage)
    outState.putBoolean(STATE_FIT_WIDTH, fitToWidth)
    super.onSaveInstanceState(outState)
  }

  override fun onStop() {
    active = false
    generation++
    clearBitmap()
    worker.execute { closeDocument() }
    super.onStop()
  }

  override fun onDestroy() {
    generation++
    clearBitmap()
    if (openViewer?.get() === this) openViewer = null
    worker.execute { closeDocument() }
    worker.shutdown()
    super.onDestroy()
  }

  private fun dp(value: Int) = (value * resources.displayMetrics.density).roundToInt()

  companion object {
    const val EXTRA_FILE_NAME = "com.romatur.woodland.review.REPORT_FILE_NAME"
    private const val STATE_PAGE = "report_page"
    private const val STATE_FIT_WIDTH = "report_fit_width"
    private val SLATE = Color.rgb(24, 49, 40)
    private var openViewer: WeakReference<ReportViewerActivity>? = null

    internal fun closeOpenViewer() { openViewer?.get()?.finish() }
  }
}
