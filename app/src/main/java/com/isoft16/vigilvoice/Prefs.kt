package com.isoft16.vigilvoice

import android.content.Context

/** Настройки. Служба читает их при каждой фразе, поэтому изменения действуют сразу. */
object Prefs {
    private fun sp(c: Context) = c.getSharedPreferences("settings", Context.MODE_PRIVATE)

    /** Слово-обращение. Пусто — выполняется любая услышанная команда. */
    fun wakeWord(c: Context): String = sp(c).getString("wake_word", "") ?: ""
    fun setWakeWord(c: Context, v: String) = sp(c).edit().putString("wake_word", v.trim()).apply()

    fun voiceReplies(c: Context): Boolean = sp(c).getBoolean("voice_replies", true)
    fun setVoiceReplies(c: Context, v: Boolean) = sp(c).edit().putBoolean("voice_replies", v).apply()
}
