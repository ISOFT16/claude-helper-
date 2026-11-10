package com.vigil.keyboard

import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.Executors

/** Бесплатный перевод через открытую точку Google Translate (без ключа). */
object Translator {
    private val pool = Executors.newSingleThreadExecutor()

    fun translate(
        text: String,
        targetLang: String,
        onResult: (String?) -> Unit
    ) {
        pool.execute {
            val result = try {
                val q = URLEncoder.encode(text, "UTF-8")
                val url = URL(
                    "https://translate.googleapis.com/translate_a/single" +
                            "?client=gtx&sl=auto&tl=$targetLang&dt=t&q=$q"
                )
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 10000
                conn.readTimeout = 15000
                conn.setRequestProperty("User-Agent", "Mozilla/5.0")
                val body = conn.inputStream.bufferedReader().readText()
                conn.disconnect()
                val arr = JSONArray(body).getJSONArray(0)
                val sb = StringBuilder()
                for (i in 0 until arr.length()) {
                    val part = arr.optJSONArray(i)?.optString(0)
                    if (!part.isNullOrEmpty() && part != "null") sb.append(part)
                }
                sb.toString().ifBlank { null }
            } catch (e: Exception) {
                null
            }
            onResult(result)
        }
    }
}
