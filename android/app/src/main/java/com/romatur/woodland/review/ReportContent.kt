package com.romatur.woodland.review

import org.json.JSONArray
import org.json.JSONObject

/** The entire untrusted JS payload is checked before resolving any private attachment. */
internal data class ReportContent(
  val title: String,
  val passport: List<List<String>>,
  val measurements: List<List<String>>,
  val criteria: List<Criterion>,
  val conclusion: String,
  val decision: String,
  val notice: String,
  val photos: List<Photo>
) {
  data class Criterion(val group: String, val title: String, val status: String, val findings: String, val comment: String)
  data class Photo(val fileName: String, val caption: String, val group: String)

  companion object {
    fun parse(input: String): ReportContent {
      // The old 200k envelope now includes a second structured copy of its text.
      // 2 * 200k plus 50k for bounded labels/keys/groups preserves all signed snapshots.
      require(input.length <= 450000)
      val json = JSONObject(input)
      val title = json.text("title", 200, required = true)
      val lines = json.array("lines", 0, 400)
      var textLength = 0
      for (index in 0 until lines.length()) {
        val line = lines.get(index) as? String ?: error("Invalid line")
        require(line.length <= 4000)
        textLength += line.length
      }
      require(textLength <= 100000)
      val doc = json.getJSONObject("document")
      val passport = doc.array("passport", 1, 20).objects().map {
        listOf(it.text("label", 120, true), it.text("value", 4000))
      }
      val measurements = doc.array("measurements", 4, 4).objects().map {
        listOf(it.text("label", 120, true), it.text("measured", 500), it.text("expected", 500))
      }
      val criteria = doc.array("criteria", 8, 8).objects().map {
        val status = it.text("status", 7)
        require(status in listOf("pending", "pass", "fail"))
        Criterion(it.text("group", 120, true), it.text("title", 120, true), status,
          it.text("findings", 4000), it.text("comment", 4000))
      }
      val decision = doc.text("decision", 120)
      require(decision in listOf("Разрешено", "Приостановлено"))
      val photos = json.array("photos", 0, 20).objects().map {
        val name = it.text("fileName", 80, true)
        require(DeviceRules.validPhotoName(name))
        Photo(name, it.text("caption", 2000), it.text("group", 120, true))
      }
      return ReportContent(title, passport, measurements, criteria, doc.text("conclusion", 4000),
        decision, doc.text("notice", 500), photos)
    }

    private fun JSONObject.text(key: String, limit: Int, required: Boolean = false): String {
      val value = get(key) as? String ?: error("Invalid text")
      require(value.length <= limit && (!required || value.isNotEmpty()))
      return value
    }

    private fun JSONObject.array(key: String, minimum: Int, maximum: Int): JSONArray = getJSONArray(key).also {
      require(it.length() in minimum..maximum)
    }

    private fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }
  }
}
