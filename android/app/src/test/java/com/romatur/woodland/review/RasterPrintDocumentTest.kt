package com.romatur.woodland.review

import java.io.ByteArrayOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RasterPrintDocumentTest {
  @Test fun streamHasExactObjectOffsetsPageOrderAndBinaryLengths() {
    val output = ByteArrayOutputStream()
    val document = RasterPrintDocument(output, 2)
    val first = byteArrayOf(-1, -40, 1, 2, -1, -39)
    val second = byteArrayOf(-1, -40, 3, 4, 5, -1, -39)
    document.page(595, 842, 1785, 2526, first)
    document.page(842, 595, 2526, 1785, second)
    document.finish()
    val result = output.toByteArray().toString(Charsets.ISO_8859_1)
    assertTrue(result.contains("/Count 2 /Kids [3 0 R 6 0 R]"))
    assertTrue(result.contains("/MediaBox [0 0 595 842]"))
    assertTrue(result.contains("/MediaBox [0 0 842 595]"))
    assertTrue(result.contains("/Length 6 >>\nstream\n${first.toString(Charsets.ISO_8859_1)}\nendstream"))
    assertTrue(result.contains("/Length 7 >>\nstream\n${second.toString(Charsets.ISO_8859_1)}\nendstream"))
    val xrefPosition = result.substringAfter("startxref\n").substringBefore('\n').toInt()
    assertTrue(result.substring(xrefPosition).startsWith("xref\n0 9\n"))
    val entries = result.substring(xrefPosition).lines().drop(3).take(8)
    entries.forEachIndexed { index, entry ->
      val position = entry.take(10).toInt()
      assertTrue(result.substring(position).startsWith("${index + 1} 0 obj\n"))
    }
    assertEquals(8, entries.size)
  }

  @Test(expected = IllegalStateException::class) fun incompleteDocumentsCannotFinish() {
    RasterPrintDocument(ByteArrayOutputStream(), 1).finish()
  }
}
