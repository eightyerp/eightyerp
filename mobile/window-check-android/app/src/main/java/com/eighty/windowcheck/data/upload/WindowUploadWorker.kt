package com.eighty.windowcheck.data.upload

import android.content.Context
import android.net.Uri
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class WindowUploadWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val uriValue = inputData.getString(KEY_URI) ?: return@withContext Result.failure()
        val locationId = inputData.getString(KEY_LOCATION_ID).orEmpty()
        val category = inputData.getString(KEY_CATEGORY).orEmpty()

        setProgress(workDataOf(KEY_STAGE to "checking_local_file"))

        val digest = MessageDigest.getInstance("SHA-256")
        val bytesRead = runCatching {
            applicationContext.contentResolver.openInputStream(Uri.parse(uriValue))?.use { stream ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                var total = 0L
                while (true) {
                    val count = stream.read(buffer)
                    if (count <= 0) break
                    digest.update(buffer, 0, count)
                    total += count
                }
                total
            }
        }.getOrNull() ?: return@withContext Result.retry()

        setProgress(workDataOf(KEY_STAGE to "queued_for_remote_upload"))

        Result.success(
            Data.Builder()
                .putString(KEY_LOCATION_ID, locationId)
                .putString(KEY_CATEGORY, category)
                .putString(KEY_SHA256, digest.digest().joinToString("") { "%02x".format(it) })
                .putLong(KEY_BYTES, bytesRead)
                .putString(KEY_MODE, "mock")
                .build(),
        )
    }

    companion object {
        const val KEY_URI = "uri"
        const val KEY_LOCATION_ID = "location_id"
        const val KEY_CATEGORY = "category"
        const val KEY_STAGE = "stage"
        const val KEY_SHA256 = "sha256"
        const val KEY_BYTES = "bytes"
        const val KEY_MODE = "mode"
    }
}

object WindowUploadScheduler {
    fun enqueueMock(
        context: Context,
        locationId: String,
        category: String,
        uri: Uri,
        sequence: Int,
    ) {
        val workName = "window-upload-$locationId-$category-$sequence"
        val request = OneTimeWorkRequestBuilder<WindowUploadWorker>()
            .setInputData(
                workDataOf(
                    WindowUploadWorker.KEY_URI to uri.toString(),
                    WindowUploadWorker.KEY_LOCATION_ID to locationId,
                    WindowUploadWorker.KEY_CATEGORY to category,
                ),
            )
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .addTag("window-upload")
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            workName,
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }
}
