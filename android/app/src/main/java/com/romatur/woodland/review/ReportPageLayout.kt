package com.romatur.woodland.review

import kotlin.math.min
import kotlin.math.roundToInt

/** Display size is independent of the raster budget so a tall page stays readable. */
internal object ReportPageLayout {
  data class Size(val bitmapWidth: Int, val bitmapHeight: Int, val displayHeight: Int)

  fun calculate(pageWidth: Int, pageHeight: Int, viewportWidth: Int, viewportHeight: Int, fitToWidth: Boolean): Size {
    require(pageWidth > 0 && pageHeight > 0 && viewportWidth > 0 && viewportHeight > 0)
    val displayScale = if (fitToWidth) viewportWidth.toFloat() / pageWidth
      else min(viewportWidth.toFloat() / pageWidth, viewportHeight.toFloat() / pageHeight)
    val bitmapScale = min(displayScale, 2048f / maxOf(pageWidth, pageHeight))
    return Size(
      (pageWidth * bitmapScale).roundToInt().coerceIn(1, 2048),
      (pageHeight * bitmapScale).roundToInt().coerceIn(1, 2048),
      if (fitToWidth) (pageHeight * displayScale).roundToInt().coerceAtLeast(1) else viewportHeight
    )
  }
}
