package com.emojiguesser.util

import android.util.Log
import com.emojiguesser.BuildConfig

object Logger {
    fun d(tag: String, message: String) {
        if (BuildConfig.DEBUG) Log.d(tag, message)
    }

    fun e(tag: String, message: String, t: Throwable? = null) {
        if (BuildConfig.DEBUG) Log.e(tag, message, t)
    }
}
