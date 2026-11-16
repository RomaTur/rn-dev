package com.romatur.woodland.review

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class OwnedAssetStoreTest {
  @get:Rule val directory = TemporaryFolder()

  @Test fun quotaRefusesNewDataWithoutDeletingExistingFiles() {
    val existing = directory.newFile("photo_existing.jpg").apply { writeBytes(ByteArray(7)) }
    val target = directory.root.resolve("photo_new.jpg")
    val store = OwnedAssetStore(directory.root, 10L) { it.endsWith(".jpg") }

    assertThrows(AssetStorageFull::class.java) {
      store.write(target) { it.write(ByteArray(4)) }
    }
    assertTrue(existing.isFile)
    assertFalse(target.exists())
    assertEquals(listOf(existing.name), directory.root.list()!!.toList())

    store.write(target) { it.write(ByteArray(3)) }
    assertEquals(3L, target.length())
  }

  @Test fun failedWriteLeavesNoPartialFile() {
    val target = directory.root.resolve("report.pdf")
    val store = OwnedAssetStore(directory.root, 10L) { it.endsWith(".pdf") }

    assertThrows(IllegalStateException::class.java) {
      store.write(target) {
        it.write(ByteArray(2))
        error("simulated export failure")
      }
    }
    assertFalse(target.exists())
    assertTrue(directory.root.list()!!.isEmpty())
  }

  @Test fun repeatingAnExportUsesTheExistingFileEvenAtTheLimit() {
    val target = directory.root.resolve("report.pdf")
    val store = OwnedAssetStore(directory.root, 3L) { it.endsWith(".pdf") }

    store.write(target) { it.write(ByteArray(3)) }
    store.write(target) { error("the existing export must be returned") }

    assertEquals(listOf(target.name), directory.root.list()!!.toList())
  }
}
