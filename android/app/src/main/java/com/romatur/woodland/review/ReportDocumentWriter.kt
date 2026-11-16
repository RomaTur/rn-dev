package com.romatur.woodland.review

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import kotlin.math.min

/** Independently authored A4 document layout; no HTML, network or external template. */
internal class ReportDocumentWriter(private val document: PdfDocument, private val report: ReportContent) {
  private val ink = Color.rgb(32, 43, 37)
  private val green = Color.rgb(36, 99, 71)
  private val red = Color.rgb(161, 44, 50)
  private val line = Color.rgb(212, 222, 215)
  private val pale = Color.rgb(242, 245, 243)
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private var page: PdfDocument.Page? = null
  private var pageNumber = 0
  private var y = 0f
  private val left = 42f
  private val width = 511f
  private val bottom = 790f
  private val lineHeight = 15f
  private val padding = 7f
  private val surface: Canvas get() = page!!.canvas

  private fun style(size: Float = 11f, bold: Boolean = false, color: Int = ink) {
    paint.color = color
    paint.textSize = size
    paint.style = Paint.Style.FILL
    paint.typeface = Typeface.create("sans-serif", if (bold) Typeface.BOLD else Typeface.NORMAL)
  }

  private fun newPage() {
    finish()
    pageNumber++
    page = document.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNumber).create())
    style(12f, true, green)
    surface.drawText("WOODLAND", left, 32f, paint)
    style(9f)
    surface.drawText("КОНТРОЛЬ КАЧЕСТВА ДРЕВЕСИНЫ", left + 100f, 32f, paint)
    rule(42f)
    y = 58f
  }

  private fun rule(at: Float) {
    paint.color = line
    paint.strokeWidth = 0.6f
    surface.drawLine(left, at, left + width, at, paint)
  }

  private fun ensure(height: Float): Boolean {
    if (page == null || y + height > bottom) { newPage(); return true }
    return false
  }

  /** Split by measured glyph width, retaining every character (including long words). */
  private fun wrap(text: String, available: Float, size: Float = 11f, bold: Boolean = false): List<String> {
    style(size, bold)
    return text.replace("\r\n", "\n").replace('\r', '\n').split('\n').flatMap { paragraph ->
      val output = mutableListOf<String>()
      var rest = paragraph
      if (rest.isEmpty()) output.add("")
      while (rest.isNotEmpty()) {
        var count = paint.breakText(rest, true, available, null).coerceAtLeast(1)
        if (count < rest.length) {
          val space = rest.lastIndexOf(' ', count - 1)
          if (space > 0) count = space
          // Never split a UTF-16 surrogate pair.
          if (count > 0 && Character.isHighSurrogate(rest[count - 1])) count--
          if (count == 0) count = min(2, rest.length)
        }
        output.add(rest.substring(0, count))
        rest = rest.substring(count).trimStart(' ')
      }
      output
    }
  }

  private fun paragraph(text: String, size: Float = 11f, bold: Boolean = false, color: Int = ink) {
    val advance = size + 5f
    wrap(text, width, size, bold).forEach {
      ensure(advance)
      style(size, bold, color)
      surface.drawText(it, left, y + size, paint)
      y += advance
    }
    y += 7f
  }

  private fun heading(title: String, continued: Boolean = false) {
    val text = if (continued) "$title · продолжение" else title
    val lines = wrap(text, width, 12f, true)
    ensure(lines.size * 17f + 12f)
    y += 5f
    for (value in lines) {
      style(12f, true, green)
      surface.drawText(value, left, y + 12f, paint)
      y += 17f
    }
    y += 7f
  }

  private fun cells(lines: List<List<String>>, widths: List<Float>, offset: Int, count: Int, header: Boolean = false) {
    val height = count * lineHeight + 2 * padding
    if (header) {
      paint.color = pale
      surface.drawRect(left, y, left + width, y + height, paint)
    }
    var x = left
    lines.forEachIndexed { column, values ->
      style(11f, header)
      for (index in 0 until count) {
        values.getOrNull(offset + index)?.let { value ->
          surface.drawText(value, x + padding, y + padding + 11f + index * lineHeight, paint)
        }
      }
      x += widths[column]
    }
    y += height
    rule(y)
  }

  /** A row may continue on another page. Column headers repeat and no cell is elided. */
  private fun table(title: String, headers: List<String>, widths: List<Float>, rows: List<List<String>>,
    keepRowsTogether: Boolean = true, repeatLeadingColumns: Int = 0) {
    val headerLines = headers.mapIndexed { index, value -> wrap(value, widths[index] - 2 * padding, bold = true) }
    val headerCount = headerLines.maxOf { it.size }
    val headerHeight = headerCount * lineHeight + 2 * padding
    val headingHeight = wrap("$title · продолжение", width, 12f, true).size * 17f + 12f
    fun start(continued: Boolean) {
      heading(title, continued)
      cells(headerLines, widths, 0, headerCount, header = true)
    }
    ensure(headingHeight + headerHeight + lineHeight + 2 * padding)
    start(false)
    rows.forEachIndexed { rowIndex, row ->
      val wrapped = row.mapIndexed { index, value -> wrap(value, widths[index] - 2 * padding) }
      val total = wrapped.maxOf { it.size }
      val fullHeight = total * lineHeight + 2 * padding
      // Keep normal rows together; only genuinely tall rows are split.
      if (keepRowsTogether && y + fullHeight > bottom && fullHeight <= bottom - 58f - headingHeight - headerHeight) {
        newPage(); start(true)
      }
      var offset = 0
      while (offset < total) {
        var capacity = ReportFlow.linesThatFit(bottom - y, padding, lineHeight)
        if (capacity == 0) { newPage(); start(true); capacity = ReportFlow.linesThatFit(bottom - y, padding, lineHeight) }
        val fragment = ReportFlow.rowFragment(wrapped, offset, capacity, repeatLeadingColumns, "Критерий ${rowIndex + 1}")
        cells(fragment.cells, widths, 0, fragment.heightLines)
        offset += fragment.consumedLines
        if (offset < total) { newPage(); start(true) }
      }
    }
    y += 13f
  }

  fun write(decode: (String) -> Bitmap) {
    newPage()
    paragraph(report.title, 19f, true)
    paragraph("Демонстрационный отчёт · ${report.decision}", 12f, true,
      if (report.decision == "Приостановлено") red else green)
    table("01  Паспорт проверки", listOf("Поле", "Значение"), listOf(168f, 343f), report.passport)
    table("02  Измерения контрольного образца", listOf("Параметр", "Измерено", "Учебный ориентир"), listOf(145f, 136f, 230f), report.measurements)
    paragraph("Измерения относятся к контрольному образцу указанного профиля. Пределы приведены для демонстрации.", 10f)
    table("03  Результаты контроля", listOf("Критерий", "Результат", "Замечания и комментарий"), listOf(151f, 112f, 248f), report.criteria.mapIndexed { index, it ->
      val status = when (it.status) { "pass" -> "Соответствует"; "fail" -> "Не соответствует"; else -> "Не оценено" }
      listOf("${index + 1}. ${it.group}\n${it.title}", status, "Причины: ${it.findings}\nКомментарий: ${it.comment}")
    }, repeatLeadingColumns = 2)
    table("04  Заключение", listOf("Решение", "Заключение инспектора"), listOf(151f, 360f), listOf(listOf(report.decision, report.conclusion)))
    paragraph(report.notice, 10f)

    // Linked grouping keeps catalogue themes and original order inside each theme.
    report.photos.withIndex().groupBy { it.value.group }.forEach { (group, entries) ->
      entries.chunked(2).forEachIndexed { pairIndex, pair ->
        val photoHeadingHeight = wrap("05  Фотоматериалы · $group · продолжение", width, 12f, true).size * 17f + 12f
        val captionHeadingHeight = wrap("Подписи · $group · продолжение", width, 12f, true).size * 17f + 12f
        ensure(photoHeadingHeight + 214f + captionHeadingHeight + 58f)
        heading("05  Фотоматериалы · $group", pairIndex > 0)
        val gap = 15f
        val cellWidth = (width - gap) / 2
        pair.forEachIndexed { column, indexed ->
          val x = left + column * (cellWidth + gap)
          style(10f, true, green)
          surface.drawText("Фото ${indexed.index + 1}", x, y + 10f, paint)
          val bitmap = decode(indexed.value.fileName)
          try {
            paint.color = pale
            surface.drawRect(x, y + 17f, x + cellWidth, y + 207f, paint)
            val scale = min((cellWidth - 8f) / bitmap.width, 182f / bitmap.height)
            val w = bitmap.width * scale
            val h = bitmap.height * scale
            surface.drawBitmap(bitmap, null, RectF(x + (cellWidth - w) / 2, y + 17f + (190f - h) / 2, x + (cellWidth + w) / 2, y + 17f + (190f + h) / 2), paint)
          } finally { bitmap.recycle() }
        }
        y += 214f
        // Only captions continue; a long caption never causes its image to be duplicated.
        table("Подписи · $group", pair.map { "Фото ${it.index + 1}" },
          if (pair.size == 2) listOf(width / 2, width / 2) else listOf(width),
          listOf(pair.map { it.value.caption }), keepRowsTogether = false)
      }
    }
    finish()
  }

  fun finish() {
    page?.let {
      rule(805f)
      style(8f)
      surface.drawText("WOODLAND · Демонстрационный отчёт", left, 820f, paint)
      surface.drawText("Страница $pageNumber", 485f, 820f, paint)
      document.finishPage(it)
    }
    page = null
  }
}
