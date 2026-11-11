package com.vigil.keyboard

import android.content.Context
import org.json.JSONArray

/** История буфера обмена (хранится локально, до 20 записей). */
object ClipStore {
    private const val KEY = "clips"
    private const val MAX = 20

    fun list(c: Context): MutableList<String> = try {
        val arr = JSONArray(Prefs.sp(c).getString(KEY, "[]"))
        MutableList(arr.length()) { arr.getString(it) }
    } catch (e: Exception) {
        mutableListOf()
    }

    fun add(c: Context, text: String) {
        val t = text.take(2000)
        if (t.isBlank()) return
        val l = list(c)
        l.remove(t)
        l.add(0, t)
        while (l.size > MAX) l.removeAt(l.size - 1)
        save(c, l)
    }

    fun remove(c: Context, text: String) {
        val l = list(c)
        l.remove(text)
        save(c, l)
    }

    fun clear(c: Context) = save(c, emptyList())

    private fun save(c: Context, l: List<String>) {
        Prefs.sp(c).edit().putString(KEY, JSONArray(l).toString()).apply()
    }
}
