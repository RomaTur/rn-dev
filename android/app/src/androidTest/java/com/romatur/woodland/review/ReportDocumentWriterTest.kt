package com.romatur.woodland.review

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.FileOutputStream
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith

/** Synthetic content only. The fixed private PDF is retained for independent text/visual checks. */
@RunWith(AndroidJUnit4::class)
class ReportDocumentWriterTest {
  private fun longText(length: Int, marker: String): String =
    "Демонстрационный образец. Полный комментарий проверки. ".repeat(length / 20 + 1)
      .take(length - marker.length - 1) + " " + marker

  private fun content(photoCount: Int = 4, escaped: Boolean = false): ReportContent {
    val commentLength = 4000 - "Комментарий: ".length
    val conclusionLength = 4000 - "Заключение: ".length
    return ReportContent(
      "ДЕМО · Проверка переносов и полного содержания PDF",
      listOf(listOf("Основание", "STRESS-DEMO-ONLY"), listOf("Инспектор", "Демонстрационный инспектор")),
      listOf(listOf("Влажность", "11 %", "8–13 %"), listOf("Длина", "1202 мм", "1200 ±3 мм"),
        listOf("Ширина", "301 мм", "300 ±3 мм"), listOf("Толщина", "20 мм", "20 ±3 мм")),
      (0 until 8).map { index -> ReportContent.Criterion("Демонстрация", "Критерий ${index + 1}", "pass", "не отмечены",
        if (escaped) "\"".repeat(commentLength) else longText(commentLength, "COMMENT_END_${index + 1}")) },
      if (escaped) "\"".repeat(conclusionLength) else longText(conclusionLength, "CONCLUSION_END_STRESS"),
      "Разрешено",
      "Демонстрационные критерии; отчёт не подтверждает соответствие стандарту.",
      (0 until photoCount).map { index -> ReportContent.Photo(
        "photo_${index.toString().padStart(8, '0')}-89ab-cdef-0123-456789abcdef.jpg",
        if (escaped) "\"".repeat(2000) else longText(1900, "PHOTO_CAPTION_END_${index + 1}"),
        if (index < photoCount / 2) "Поверхность" else "Измерения"
      ) }
    )
  }

  private fun payload(content: ReportContent): JSONObject {
    val lines = content.passport.map { "${it[0]}: ${it[1]}" } +
      content.criteria.flatMap { listOf("${it.title}: Соответствует", "Причины: ${it.findings}", "Комментарий: ${it.comment}") } +
      listOf("Заключение: ${content.conclusion}", content.notice)
    val doc = JSONObject().put("passport", JSONArray(content.passport.map {
      JSONObject().put("label", it[0]).put("value", it[1])
    })).put("measurements", JSONArray(content.measurements.map {
      JSONObject().put("label", it[0]).put("measured", it[1]).put("expected", it[2])
    })).put("criteria", JSONArray(content.criteria.map {
      JSONObject().put("group", it.group).put("title", it.title).put("status", it.status)
        .put("findings", it.findings).put("comment", it.comment)
    })).put("conclusion", content.conclusion).put("decision", content.decision).put("notice", content.notice)
    return JSONObject().put("title", content.title).put("lines", JSONArray(lines))
      .put("photos", JSONArray(content.photos.map {
        JSONObject().put("fileName", it.fileName).put("caption", it.caption).put("group", it.group)
      })).put("document", doc)
  }

  @Test fun legacyMaximumStringsRemainValidAfterStructuredDuplication() {
    val input = payload(content(photoCount = 20, escaped = true))
    val legacy = JSONObject(input.toString()).apply {
      remove("document")
      val photos = getJSONArray("photos")
      for (index in 0 until photos.length()) photos.getJSONObject(index).remove("group")
    }
    assertTrue(legacy.toString().length <= 200000)
    assertTrue(input.toString().length > 200000)
    assertTrue(input.toString().length <= 450000)
    val parsed = ReportContent.parse(input.toString())
    assertEquals(3987, parsed.criteria[0].comment.length)
    assertEquals(3988, parsed.conclusion.length)
    input.getJSONObject("document").getJSONArray("criteria").getJSONObject(0).put("comment", "x".repeat(4001))
    try { ReportContent.parse(input.toString()); fail("Structured field overflow must be rejected") }
    catch (_: IllegalArgumentException) { }
  }

  @Test fun longRowsAndCaptionsProduceReadableMultipagePdfWithoutRepeatingPhotos() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val directory = File(context.filesDir, "woodland/reports").apply { mkdirs() }
    val target = File(directory, "pdf_01234567-89ab-cdef-0123-456789abcdef.pdf")
    val parsed = ReportContent.parse(payload(content()).toString())
    val decoded = mutableListOf<String>()
    val document = PdfDocument()
    try {
      val writer = ReportDocumentWriter(document, parsed)
      try {
        writer.write { fileName ->
          decoded.add(fileName)
          val index = parsed.photos.indexOfFirst { it.fileName == fileName }
          val bitmap = Bitmap.createBitmap(if (index % 2 == 0) 320 else 120, if (index % 2 == 0) 160 else 320, Bitmap.Config.ARGB_8888)
          val canvas = Canvas(bitmap)
          canvas.drawColor(Color.rgb(219, 230, 240))
          val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(49, 94, 140); textSize = 15f }
          canvas.drawText("DEMO PHOTO ${index + 1}", 8f, 28f, paint)
          bitmap
        }
        FileOutputStream(target).use { output -> document.writeTo(output); output.fd.sync() }
      } finally { writer.finish() }
    } finally { document.close() }
    assertEquals(parsed.photos.map { it.fileName }, decoded)
    assertEquals(4, decoded.toSet().size)
    assertTrue(target.isFile && target.length() > 1000)
    PdfRenderer(ParcelFileDescriptor.open(target, ParcelFileDescriptor.MODE_READ_ONLY)).use { renderer ->
      assertTrue("Long comments must flow across multiple complete pages", renderer.pageCount >= 8)
      renderer.openPage(renderer.pageCount - 1).use { page ->
        assertEquals(595, page.width)
        assertEquals(842, page.height)
      }
    }
  }
}
