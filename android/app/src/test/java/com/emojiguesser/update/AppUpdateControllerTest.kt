package com.emojiguesser.update

import android.app.Activity
import android.os.Looper
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResult
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityOptionsCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.android.gms.tasks.Tasks
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.appupdate.testing.FakeAppUpdateManager
import com.google.android.play.core.install.model.AppUpdateType.FLEXIBLE
import com.google.android.play.core.install.model.AppUpdateType.IMMEDIATE
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowLog
import java.lang.reflect.InvocationHandler
import java.lang.reflect.Proxy

@RunWith(AndroidJUnit4::class)
class AppUpdateControllerTest {
    private val activity = Robolectric.buildActivity(ComponentActivity::class.java).setup().get()
    private val fake = FakeAppUpdateManager(activity)
    private val flows = mutableListOf<Int>()

    // Records which flow the controller asks for, then lets the fake play it out.
    private val manager = updateManager { method, args ->
        if (method.name == "startUpdateFlowForResult") flows += (args!![2] as AppUpdateOptions).appUpdateType()
        method.invoke(fake, *(args ?: emptyArray()))
    }

    private val controller = AppUpdateController(activity, manager)

    private val launcher = object : ActivityResultLauncher<IntentSenderRequest>() {
        override val contract = ActivityResultContracts.StartIntentSenderForResult()
        override fun launch(input: IntentSenderRequest, options: ActivityOptionsCompat?) = Unit
        override fun unregister() = Unit
    }

    private fun updateManager(handler: (java.lang.reflect.Method, Array<out Any?>?) -> Any?) =
        Proxy.newProxyInstance(
            AppUpdateManager::class.java.classLoader,
            arrayOf(AppUpdateManager::class.java),
            InvocationHandler { _, method, args -> handler(method, args) }
        ) as AppUpdateManager

    private fun idle() = shadowOf(Looper.getMainLooper()).idle()

    private fun checkForUpdate() {
        controller.checkForUpdate(launcher)
        idle()
    }

    private fun logs() = ShadowLog.getLogsForTag("AppUpdateController")

    @Test
    fun `no update leaves Play alone`() {
        fake.setUpdateNotAvailable()

        checkForUpdate()

        assertEquals(emptyList<Int>(), flows)
    }

    @Test
    fun `a routine update downloads in the background`() {
        fake.setUpdateAvailable(2)

        checkForUpdate()

        assertEquals(listOf(FLEXIBLE), flows)
        assertTrue(fake.isConfirmationDialogVisible)
    }

    @Test
    fun `a high priority update installs immediately`() {
        fake.setUpdateAvailable(2)
        fake.setUpdatePriority(4)

        checkForUpdate()

        assertEquals(listOf(IMMEDIATE), flows)
        assertTrue(fake.isImmediateFlowVisible)
    }

    @Test
    fun `a month-stale build installs immediately`() {
        fake.setUpdateAvailable(2)
        fake.setClientVersionStalenessDays(30)

        checkForUpdate()

        assertEquals(listOf(IMMEDIATE), flows)
    }

    @Test
    fun `an urgent update stays flexible when immediate is not allowed`() {
        fake.setUpdateAvailable(2, FLEXIBLE)
        fake.setUpdatePriority(5)

        checkForUpdate()

        assertEquals(listOf(FLEXIBLE), flows)
    }

    @Test
    fun `an immediate-only update still starts`() {
        fake.setUpdateAvailable(2, IMMEDIATE)

        checkForUpdate()

        assertEquals(listOf(IMMEDIATE), flows)
    }

    @Test
    fun `a finished download offers the restart`() {
        fake.setUpdateAvailable(2)
        checkForUpdate()
        fake.userAcceptsUpdate()
        fake.downloadStarts()
        assertFalse(controller.updateDownloaded.value)

        fake.downloadCompletes()
        assertTrue(controller.updateDownloaded.value)

        controller.completeUpdate()
        assertTrue(fake.isInstallSplashScreenVisible)
    }

    @Test
    fun `resuming picks up a download that finished in the background`() {
        fake.setUpdateAvailable(2)
        checkForUpdate()
        fake.userAcceptsUpdate()
        fake.downloadStarts()
        fake.downloadCompletes()
        val resumed = AppUpdateController(activity, manager)

        resumed.onResume(launcher)
        idle()

        assertTrue(resumed.updateDownloaded.value)
    }

    @Test
    fun `resuming restarts a stalled immediate update`() {
        fake.setUpdateAvailable(2, IMMEDIATE)
        checkForUpdate()
        fake.userAcceptsUpdate()

        controller.onResume(launcher)
        idle()

        assertEquals(listOf(IMMEDIATE, IMMEDIATE), flows)
    }

    @Test
    fun `resuming with nothing pending changes nothing`() {
        fake.setUpdateNotAvailable()

        controller.onResume(launcher)
        idle()

        assertEquals(emptyList<Int>(), flows)
        assertFalse(controller.updateDownloaded.value)
    }

    @Test
    fun `a disposed controller stops listening for downloads`() {
        fake.setUpdateAvailable(2)
        checkForUpdate()
        fake.userAcceptsUpdate()
        fake.downloadStarts()

        controller.dispose()
        fake.downloadCompletes()

        assertFalse(controller.updateDownloaded.value)
    }

    @Test
    fun `only an unfinished update flow is logged`() {
        controller.handleResult(ActivityResult(Activity.RESULT_OK, null))
        controller.handleResult(ActivityResult(Activity.RESULT_CANCELED, null))

        assertEquals(listOf("Update flow not completed: resultCode=0"), logs().map { it.msg })
    }

    @Test
    fun `a failed update check is logged rather than thrown`() {
        val offline = updateManager { method, _ ->
            if (method.name == "getAppUpdateInfo") Tasks.forException<AppUpdateInfo>(IllegalStateException("no Play Store")) else null
        }

        AppUpdateController(activity, offline).checkForUpdate(launcher)
        idle()

        val log = logs().single()
        assertEquals(Log.WARN, log.type)
        assertEquals("appUpdateInfo check failed", log.msg)
    }
}
