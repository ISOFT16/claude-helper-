package com.isoft16.vigilvoice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Слушает без остановки: системное распознавание речи работает по одной фразе,
 * поэтому после каждого результата или ошибки оно запускается заново.
 * Все вызовы — только с главного потока.
 */
class Listener(
    private val context: Context,
    private val onText: (String) -> Unit,
    private val onProblem: (String?) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var running = false
    private var paused = false
    private var onDevice = Build.VERSION.SDK_INT >= 31
    private var failures = 0

    private val restart = Runnable { listen() }

    /** Если распознавание молча зависло, пересоздаём его. */
    private val watchdog = Runnable {
        destroyRecognizer()
        schedule(200)
    }

    fun start() {
        running = true
        paused = false
        schedule(0)
    }

    fun stop() {
        running = false
        main.removeCallbacks(restart)
        main.removeCallbacks(watchdog)
        destroyRecognizer()
    }

    /** На время, пока телефон сам говорит вслух, чтобы он не слушал себя. */
    fun pause() {
        if (paused) return
        paused = true
        main.removeCallbacks(restart)
        main.removeCallbacks(watchdog)
        try {
            recognizer?.cancel()
        } catch (_: Exception) {
        }
    }

    fun resume() {
        if (!paused) return
        paused = false
        schedule(150)
    }

    private fun schedule(delayMs: Long) {
        main.removeCallbacks(restart)
        if (running && !paused) main.postDelayed(restart, delayMs)
    }

    private fun destroyRecognizer() {
        try {
            recognizer?.destroy()
        } catch (_: Exception) {
        }
        recognizer = null
    }

    private fun createRecognizer(): SpeechRecognizer? {
        if (onDevice && Build.VERSION.SDK_INT >= 31) {
            try {
                if (SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
                    return SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
                }
            } catch (_: Exception) {
            }
            onDevice = false
        }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) return null
        return SpeechRecognizer.createSpeechRecognizer(context)
    }

    private fun listen() {
        if (!running || paused) return
        val r = recognizer ?: createRecognizer()?.also {
            it.setRecognitionListener(callbacks)
            recognizer = it
        }
        if (r == null) {
            onProblem("На телефоне нет распознавания речи. Установите приложение Google.")
            schedule(10_000)
            return
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
            .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        try {
            r.startListening(intent)
            main.removeCallbacks(watchdog)
            main.postDelayed(watchdog, 20_000)
        } catch (_: Exception) {
            destroyRecognizer()
            schedule(1_000)
        }
    }

    private val callbacks = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            failures = 0
            onProblem(null)
        }

        override fun onBeginningOfSpeech() {
            // Длинная фраза — не зависание.
            main.removeCallbacks(watchdog)
            main.postDelayed(watchdog, 60_000)
        }

        override fun onResults(results: Bundle?) {
            main.removeCallbacks(watchdog)
            val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
            schedule(100)
            if (!text.isNullOrBlank()) onText(text)
        }

        override fun onError(error: Int) {
            main.removeCallbacks(watchdog)
            when (error) {
                // Тишина или неразборчиво — это нормально, слушаем дальше.
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> schedule(100)

                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> {
                    try {
                        recognizer?.cancel()
                    } catch (_: Exception) {
                    }
                    schedule(600)
                }

                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                    onProblem("Нет доступа к микрофону. Откройте Vigil Voice и разрешите микрофон.")
                    schedule(5_000)
                }

                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> {
                    if (++failures >= 3) onProblem("Нет связи с распознаванием речи. Проверьте интернет.")
                    schedule(2_000)
                }

                else -> {
                    // 12 и 13 — на устройстве нет русского языка для распознавания без интернета.
                    if (onDevice && (error == 12 || error == 13 || ++failures >= 3)) {
                        onDevice = false
                        failures = 0
                    }
                    destroyRecognizer()
                    schedule(minOf(500L * (failures + 1), 5_000L))
                }
            }
        }

        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onPartialResults(partialResults: Bundle?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }
}
