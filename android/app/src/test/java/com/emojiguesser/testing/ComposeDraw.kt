package com.emojiguesser.testing

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import org.junit.rules.TestRule

/**
 * Robolectric never draws a frame by itself; this runs every drawBehind and Canvas block once.
 * Content with vector icons needs @GraphicsMode(NATIVE), or the icon bitmap is null.
 */
fun <R : TestRule, A : ComponentActivity> AndroidComposeTestRule<R, A>.drawFrame() = runOnIdle {
    val view = activity.window.decorView
    view.draw(Canvas(Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)))
}
