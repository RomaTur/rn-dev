package com.romatur.woodland.review

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReportFlowTest {
  @Test fun criterionAndResultRepeatWhileCommentContinuesWithoutDuplication() {
    val context = listOf("1. Поверхность", "Трещины")
    val result = listOf("Не соответствует")
    val comments = (0 until 23).map { "Комментарий $it" }
    val columns = listOf(context, result, comments)
    val fragments = mutableListOf<ReportFlow.RowFragment>()
    var offset = 0
    while (offset < comments.size) {
      val fragment = ReportFlow.rowFragment(columns, offset, 5, 2, "Критерий 1")
      fragments.add(fragment)
      offset += fragment.consumedLines
    }
    assertEquals(comments, fragments.flatMap { it.cells[2] })
    fragments.forEach {
      assertEquals(context, it.cells[0])
      assertEquals(result, it.cells[1])
      assertTrue(it.heightLines <= 5)
    }
  }

  @Test fun longCriterionIsPreservedThenReferencedWithoutClipping() {
    val context = (0 until 12).map { "Исходная строка критерия $it" }
    val comments = (0 until 22).map { "Комментарий $it" }
    val columns = listOf(context, listOf("Соответствует"), comments)
    val fragments = (0 until 22 step 5).map { ReportFlow.rowFragment(columns, it, 5, 2, "Критерий 7") }
    assertEquals(context, fragments.take(3).flatMap { it.cells[0] })
    assertEquals(listOf("Критерий 7"), fragments[3].cells[0])
    assertEquals(listOf("Критерий 7"), fragments[4].cells[0])
    assertEquals(comments, fragments.flatMap { it.cells[2] })
    assertTrue(fragments.all { it.heightLines <= 5 })
  }

  @Test fun finalFragmentReservesSpaceForRepeatedCriterionAndOtherTablesDoNotRepeat() {
    val columns = listOf(listOf("Критерий", "Название", "Уточнение"), listOf("Соответствует"), (0 until 6).map { "$it" })
    val continued = ReportFlow.rowFragment(columns, 5, 5, 2, "Критерий 1")
    assertEquals(1, continued.consumedLines)
    assertEquals(3, continued.heightLines)
    val ordinary = ReportFlow.rowFragment(columns, 5, 5)
    assertTrue(ordinary.cells[0].isEmpty())
    assertEquals(1, ordinary.heightLines)
  }

  @Test fun tableRowsNeverOverflowAndCanContinueWithoutLosingLines() {
    val remainingLines = (0 until 307).toList()
    val firstCapacity = ReportFlow.linesThatFit(104f, 7f, 15f)
    val nextCapacity = ReportFlow.linesThatFit(640f, 7f, 15f)
    assertEquals(6, firstCapacity)
    assertEquals(41, nextCapacity)
    val fragments = listOf(remainingLines.take(firstCapacity)) + remainingLines.drop(firstCapacity).chunked(nextCapacity)
    assertEquals(remainingLines, fragments.flatten())
    assertTrue(fragments.drop(1).all { it.size * 15 + 14 <= 640 })
    assertEquals(0, ReportFlow.linesThatFit(28f, 7f, 15f))
  }

  @Test fun printRangesAreClippedDeduplicatedAndKeepDocumentOrder() {
    assertEquals(listOf(0, 1, 2, 4, 5), ReportFlow.selectedPages(6, listOf(4..100, 1..2, 0..1)))
    assertEquals((0 until 6).toList(), ReportFlow.selectedPages(6, listOf(0..Int.MAX_VALUE)))
    assertEquals(emptyList<Int>(), ReportFlow.selectedPages(6, listOf(6..100)))
    assertEquals(emptyList<Int>(), ReportFlow.selectedPages(6, emptyList()))
  }
}
