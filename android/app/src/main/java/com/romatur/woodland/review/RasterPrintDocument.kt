package com.romatur.woodland.review

import java.io.OutputStream
import java.util.Locale

/** Streams trusted, locally rendered JPEG pages without retaining a whole document's rasters. */
internal class RasterPrintDocument(private val output: OutputStream, private val pageCount: Int) {
  private val offsets = LongArray(3 + pageCount * 3)
  private var position = 0L
  private var written = 0
  private var finished = false

  init {
    require(pageCount > 0)
    text("%PDF-1.4\n")
    objectStart(1)
    text("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    objectStart(2)
    val children = (0 until pageCount).joinToString(" ") { "${3 + it * 3} 0 R" }
    text("<< /Type /Pages /Count $pageCount /Kids [$children] >>\nendobj\n")
  }

  private fun bytes(value: ByteArray) { output.write(value); position += value.size }
  private fun text(value: String) = bytes(value.toByteArray(Charsets.US_ASCII))
  private fun objectStart(id: Int) { offsets[id] = position; text("$id 0 obj\n") }

  fun page(width: Int, height: Int, bitmapWidth: Int, bitmapHeight: Int, jpeg: ByteArray) {
    check(!finished && written < pageCount)
    require(width > 0 && height > 0 && bitmapWidth > 0 && bitmapHeight > 0 && jpeg.isNotEmpty())
    val id = 3 + written * 3
    objectStart(id)
    text("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $width $height] /Resources << /XObject << /Image ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>\nendobj\n")
    objectStart(id + 1)
    text("<< /Type /XObject /Subtype /Image /Width $bitmapWidth /Height $bitmapHeight /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.size} >>\nstream\n")
    bytes(jpeg)
    text("\nendstream\nendobj\n")
    objectStart(id + 2)
    val content = "q\n$width 0 0 $height 0 0 cm\n/Image Do\nQ\n"
    text("<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n")
    written++
  }

  fun finish() {
    check(!finished && written == pageCount)
    val xref = position
    text("xref\n0 ${offsets.size}\n0000000000 65535 f \n")
    for (id in 1 until offsets.size) text(String.format(Locale.ROOT, "%010d 00000 n \n", offsets[id]))
    text("trailer\n<< /Size ${offsets.size} /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n")
    finished = true
  }
}
