package com.emojiguesser.update

import android.app.Activity
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Wraps Play In-App Updates. Uses flexible flow so users can keep playing while the
 * update downloads; high-priority or very stale builds escalate to immediate.
 */
class AppUpdateController(activity: Activity) {

    private val manager: AppUpdateManager = AppUpdateManagerFactory.create(activity)

    private val _updateDownloaded = MutableStateFlow(false)
    val updateDownloaded: StateFlow<Boolean> = _updateDownloaded.asStateFlow()

    private val installListener = InstallStateUpdatedListener { state ->
        if (state.installStatus() == InstallStatus.DOWNLOADED) {
            _updateDownloaded.value = true
        }
    }

    init {
        manager.registerListener(installListener)
    }

    /** Kick off an update check; launches the Play update UI if one is available. */
    fun checkForUpdate(launcher: ActivityResultLauncher<IntentSenderRequest>) {
        manager.appUpdateInfo.addOnSuccessListener { info ->
            if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE) return@addOnSuccessListener
            val type = pickUpdateType(info) ?: return@addOnSuccessListener
            manager.startUpdateFlowForResult(
                info,
                launcher,
                AppUpdateOptions.newBuilder(type).build()
            )
        }.addOnFailureListener { e ->
            Log.w(TAG, "appUpdateInfo check failed", e)
        }
    }

    /** Re-check on resume: surface downloaded flexible updates and resume stalled immediate ones. */
    fun onResume(launcher: ActivityResultLauncher<IntentSenderRequest>) {
        manager.appUpdateInfo.addOnSuccessListener { info ->
            if (info.installStatus() == InstallStatus.DOWNLOADED) {
                _updateDownloaded.value = true
            }
            if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
                manager.startUpdateFlowForResult(
                    info,
                    launcher,
                    AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build()
                )
            }
        }
    }

    /** Finalise a downloaded flexible update and restart. */
    fun completeUpdate() {
        manager.completeUpdate()
    }

    fun dispose() {
        manager.unregisterListener(installListener)
    }

    fun handleResult(result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) {
            Log.d(TAG, "Update flow not completed: resultCode=${result.resultCode}")
        }
    }

    /** High-priority or very stale updates run immediate; otherwise flexible. */
    private fun pickUpdateType(info: AppUpdateInfo): Int? {
        val priority = info.updatePriority()
        val staleness = info.clientVersionStalenessDays() ?: 0
        val immediateAllowed = info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
        val flexibleAllowed = info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
        return when {
            (priority >= 4 || staleness >= STALENESS_IMMEDIATE_DAYS) && immediateAllowed -> AppUpdateType.IMMEDIATE
            flexibleAllowed -> AppUpdateType.FLEXIBLE
            immediateAllowed -> AppUpdateType.IMMEDIATE
            else -> null
        }
    }

    companion object {
        private const val TAG = "AppUpdateController"
        private const val STALENESS_IMMEDIATE_DAYS = 30
    }
}
