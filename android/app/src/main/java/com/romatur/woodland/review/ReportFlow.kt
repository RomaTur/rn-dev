package com.romatur.woodland.review

import kotlin.math.floor

/** Pure pagination calculations shared by tables and their continuation pages. */
internal object ReportFlow {
  data class RowFragment(val cells: List<List<String>>, val consumedLines: Int, val heightLines: Int)

  /** Repeat completed context cells while each original cell's remaining lines advance exactly once. */
  fun rowFragment(columns: List<List<String>>, offset: Int, capacity: Int,
    repeatLeadingColumns: Int = 0, rowReference: String = ""): RowFragment {
    require(columns.isNotEmpty() && offset >= 0 && capacity > 0)
    require(repeatLeadingColumns in 0..columns.size)
    val remaining = columns.maxOf { it.size } - offset
    require(remaining > 0)
    val consumed = minOf(remaining, capacity)
    val cells = columns.mapIndexed { index, lines ->
      if (offset > 0 && index < repeatLeadingColumns && offset >= lines.size) {
        // A very long context was already preserved on earlier pages. Use an explicit
        // stable reference instead of clipping or replaying more than one page of it.
        if (lines.size <= capacity) lines else listOf(rowReference)
      } else lines.drop(offset).take(consumed)
    }
    return RowFragment(cells, consumed, maxOf(consumed, cells.maxOf { it.size }))
  }

  fun linesThatFit(remainingHeight: Float, padding: Float, lineHeight: Float): Int {
    require(lineHeight > 0 && padding >= 0)
    return floor((remainingHeight - padding * 2) / lineHeight).toInt().coerceAtLeast(0)
  }

  fun selectedPages(pageCount: Int, ranges: List<IntRange>): List<Int> {
    require(pageCount > 0)
    return (0 until pageCount).filter { page -> ranges.any { page in it } }
  }
}
