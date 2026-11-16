package com.romatur.woodland.review

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReportPageLayoutTest {
  @Test fun a4BodyRemainsReadableOnLandscapeTablet() {
    // 1066 dp tablet at 240 dpi, after margins and fixed header/footer.
    val layout = ReportPageLayout.calculate(595, 842, 1563, 725, true)
    val bodyTextDp = 11.0 * layout.displayHeight / 842 / 1.5
    assertTrue("11 pt body should display at least 18 dp", bodyTextDp >= 18)
    assertTrue("Page must scroll instead of shrinking to viewport height", layout.displayHeight > 2000)
    assertEquals(2048, layout.bitmapHeight)
  }

  @Test fun overviewFitsPageWithoutVerticalScrolling() {
    val layout = ReportPageLayout.calculate(595, 842, 1563, 725, false)
    assertEquals(725, layout.displayHeight)
    assertTrue(layout.bitmapWidth <= 1563)
    assertTrue(layout.bitmapHeight <= 725)
  }

  @Test fun largeScreensDoNotExceedBitmapMemoryBudget() {
    for ((width, height) in listOf(595 to 842, 842 to 595)) {
      val layout = ReportPageLayout.calculate(width, height, 7680, 4320, true)
      assertTrue(layout.bitmapWidth in 1..2048)
      assertTrue(layout.bitmapHeight in 1..2048)
      assertTrue("Display must not shrink with the raster cap", layout.displayHeight > 4320)
    }
  }
}
