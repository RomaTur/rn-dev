package com.romatur.woodland.review

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.OutputStream

internal class AssetStorageFull : IOException()

/** The temporary file lives beside the final asset so publishing it is atomic. */
internal class OwnedAssetStore(
  private val directory: File,
  private val limit: Long,
  private val isAssetName: (String) -> Boolean,
) {
  fun write(target: File, writeContent: (OutputStream) -> Unit) = synchronized(writeLock) {
    require(target.parentFile == directory && isAssetName(target.name))
    if (target.isFile && target.length() > 0L) return@synchronized

    val files = directory.listFiles() ?: throw IOException("Cannot list asset directory")
    var remaining = limit - files.filter { it.isFile && isAssetName(it.name) }.sumOf { it.length() }
    if (remaining <= 0L) throw AssetStorageFull()

    // Reuse a single staging path after a process interruption.
    val staged = File(directory, ".asset.pending")
    try {
      FileOutputStream(staged).use { raw ->
        val bounded = object : OutputStream() {
          override fun write(value: Int) {
            if (remaining < 1L) throw AssetStorageFull()
            raw.write(value)
            remaining--
          }

          override fun write(bytes: ByteArray, offset: Int, count: Int) {
            if (count > remaining) throw AssetStorageFull()
            raw.write(bytes, offset, count)
            remaining -= count
          }
        }
        writeContent(bounded)
        raw.fd.sync()
      }
      if (staged.length() == 0L || !staged.renameTo(target)) {
        throw IOException("Cannot publish asset")
      }
    } finally {
      staged.delete()
    }
  }

  private companion object {
    val writeLock = Any()
  }
}
