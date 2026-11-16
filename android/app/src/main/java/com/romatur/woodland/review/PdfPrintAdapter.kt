package com.romatur.woodland.review

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.OperationCanceledException
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import java.io.File
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import kotlin.math.min
import kotlin.math.roundToInt

/** Only receives a file already resolved inside the application's private report directory. */
internal class PdfPrintAdapter(private val file: File, private val sessionActive: () -> Boolean) : PrintDocumentAdapter() {
  private val worker = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var finished = false

  private fun check(signal: CancellationSignal) {
    signal.throwIfCanceled()
    if (finished) throw OperationCanceledException()
    kotlin.check(sessionActive()) { "Session locked" }
  }

  override fun onLayout(oldAttributes: PrintAttributes?, newAttributes: PrintAttributes, cancellationSignal: CancellationSignal,
    callback: LayoutResultCallback, extras: Bundle?) {
    try {
      worker.execute {
        try {
          check(cancellationSignal)
          val count = PdfRenderer(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)).use { it.pageCount }
          check(cancellationSignal)
          val info = PrintDocumentInfo.Builder("Woodland-report.pdf")
            .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount(count).build()
          main.post {
            if (cancellationSignal.isCanceled || finished) callback.onLayoutCancelled()
            else if (!sessionActive()) callback.onLayoutFailed("Войдите с PIN-кодом инспектора.")
            else callback.onLayoutFinished(info, oldAttributes != newAttributes)
          }
        } catch (_: OperationCanceledException) { main.post { callback.onLayoutCancelled() } }
        catch (_: Exception) { main.post { callback.onLayoutFailed("Не удалось подготовить отчёт к печати.") } }
      }
    } catch (_: RejectedExecutionException) { callback.onLayoutCancelled() }
  }

  override fun onWrite(pages: Array<out PageRange>, destination: ParcelFileDescriptor, cancellationSignal: CancellationSignal,
    callback: WriteResultCallback) {
    try {
      worker.execute {
        try {
          check(cancellationSignal)
          val written = ParcelFileDescriptor.AutoCloseOutputStream(destination).use { output ->
            PdfRenderer(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)).use { renderer ->
              val selected = ReportFlow.selectedPages(renderer.pageCount, pages.map { it.start..it.end })
              require(selected.isNotEmpty())
              val checkedOutput = object : OutputStream() {
                override fun write(value: Int) { check(cancellationSignal); output.write(value) }
                override fun write(buffer: ByteArray, offset: Int, length: Int) { check(cancellationSignal); output.write(buffer, offset, length) }
              }
              if (selected.size == renderer.pageCount) {
                // Keep the original vector PDF when all pages are requested.
                file.inputStream().use { it.copyTo(checkedOutput) }
              } else {
                writeSelected(renderer, selected, checkedOutput, cancellationSignal)
              }
              output.flush()
              selected
            }
          }
          check(cancellationSignal)
          val ranges = written.map { PageRange(it, it) }.toTypedArray()
          main.post {
            if (cancellationSignal.isCanceled || finished) callback.onWriteCancelled()
            else if (!sessionActive()) callback.onWriteFailed("Войдите с PIN-кодом инспектора.")
            else callback.onWriteFinished(ranges)
          }
        } catch (_: OperationCanceledException) { main.post { callback.onWriteCancelled() } }
        catch (_: Exception) { main.post { callback.onWriteFailed("Не удалось передать выбранные страницы в системную печать.") } }
        finally { try { destination.close() } catch (_: Exception) { } }
      }
    } catch (_: RejectedExecutionException) {
      try { destination.close() } catch (_: Exception) { }
      callback.onWriteCancelled()
    }
  }

  private fun writeSelected(renderer: PdfRenderer, pages: List<Int>, output: OutputStream, signal: CancellationSignal) {
    // PdfDocument cannot import vector pages on the supported Android API levels.
    // Render selected pages at 216 dpi, capped at 3072 px (~24 MiB per bitmap).
    val document = RasterPrintDocument(output, pages.size)
    for (index in pages) {
        check(signal)
        renderer.openPage(index).use { source ->
          val scale = min(3f, 3072f / maxOf(source.width, source.height))
          val bitmap = Bitmap.createBitmap((source.width * scale).roundToInt().coerceAtLeast(1),
            (source.height * scale).roundToInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
          try {
            bitmap.eraseColor(Color.WHITE)
            source.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
            check(signal)
            val encoded = ByteArrayOutputStream().use { buffer ->
              kotlin.check(bitmap.compress(Bitmap.CompressFormat.JPEG, 95, buffer))
              buffer.toByteArray()
            }
            check(signal)
            document.page(source.width, source.height, bitmap.width, bitmap.height, encoded)
          } finally { bitmap.recycle() }
        }
    }
    check(signal)
    document.finish()
  }

  override fun onFinish() {
    finished = true
    worker.shutdown()
    super.onFinish()
  }
}
