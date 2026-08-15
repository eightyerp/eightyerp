package com.eighty.windowcheck.util

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

fun Context.createCaptureUri(prefix: String = "window"): Uri {
    val directory = File(cacheDir, "window-check/images").apply { mkdirs() }
    val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.KOREA).format(Date())
    val file = File(directory, "${prefix}_$timestamp.jpg")
    return FileProvider.getUriForFile(
        this,
        "$packageName.fileprovider",
        file,
    )
}

fun Context.copyImageToCache(sourceUri: Uri): Uri {
    val directory = File(cacheDir, "window-check/images").apply { mkdirs() }
    val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.KOREA).format(Date())
    val extension = when (contentResolver.getType(sourceUri)) {
        "image/png" -> "png"
        "image/webp" -> "webp"
        else -> "jpg"
    }
    val target = File(directory, "upload_${timestamp}.$extension")
    contentResolver.openInputStream(sourceUri)?.use { input ->
        target.outputStream().use { output -> input.copyTo(output) }
    } ?: error("선택한 사진을 열 수 없습니다.")

    return FileProvider.getUriForFile(
        this,
        "$packageName.fileprovider",
        target,
    )
}

fun Context.getDisplayName(uri: Uri): String? {
    return contentResolver.query(
        uri,
        arrayOf(OpenableColumns.DISPLAY_NAME),
        null,
        null,
        null,
    )?.use { cursor ->
        if (!cursor.moveToFirst()) return@use null
        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (index >= 0) cursor.getString(index) else null
    }
}

@Composable
fun ContentUriImage(
    uri: Uri?,
    modifier: Modifier = Modifier,
    emptyText: String = "촬영 또는 업로드 후 미리보기가 표시됩니다.",
) {
    val context = LocalContext.current
    val bitmap by produceState<android.graphics.Bitmap?>(initialValue = null, uri) {
        value = if (uri == null) {
            null
        } else {
            withContext(Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openInputStream(uri)?.use { input ->
                        BitmapFactory.decodeStream(input)
                    }
                }.getOrNull()
            }
        }
    }

    Box(
        modifier = modifier.background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap == null) {
            Text(
                text = emptyText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Image(
                bitmap = requireNotNull(bitmap).asImageBitmap(),
                contentDescription = "창호 점검 사진 미리보기",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        }
    }
}
