package com.eighty.windowcheck.ui.screens

import android.net.Uri
import androidx.compose.runtime.Composable
import com.eighty.windowcheck.model.CaptureSkipReason
import com.eighty.windowcheck.model.CaptureType
import com.eighty.windowcheck.model.InspectionMode
import com.eighty.windowcheck.model.PhotoCaptureDecision

/**
 * Adds the one-photo quick path without duplicating the base capture UI.
 * In simple mode, once the required whole-window photo exists, the primary
 * button skips the remaining optional base-photo items and moves on.
 */
@Composable
fun CaptureScreen(
    locationName: String,
    currentLocationIndex: Int,
    totalLocations: Int,
    currentIndex: Int,
    completedCount: Int,
    latestPhotoUri: Uri?,
    inspectionMode: InspectionMode,
    decision: PhotoCaptureDecision?,
    onBack: () -> Unit,
    onCapture: () -> Unit,
    onGallery: () -> Unit,
    onSkip: (CaptureSkipReason) -> Unit,
    onDefer: () -> Unit,
    onClearDecision: () -> Unit,
    onSkipRemaining: () -> Unit,
    onNext: () -> Unit,
    nextLabel: String,
) {
    val quickWholePhotoPath =
        currentIndex == CaptureType.WHOLE_WINDOW.ordinal &&
            latestPhotoUri != null &&
            inspectionMode == InspectionMode.SIMPLE

    CaptureScreen(
        locationName = locationName,
        currentLocationIndex = currentLocationIndex,
        totalLocations = totalLocations,
        currentIndex = currentIndex,
        completedCount = completedCount,
        latestPhotoUri = latestPhotoUri,
        inspectionMode = inspectionMode,
        decision = decision,
        onBack = onBack,
        onCapture = onCapture,
        onGallery = onGallery,
        onSkip = onSkip,
        onDefer = onDefer,
        onClearDecision = onClearDecision,
        onNext = if (quickWholePhotoPath) onSkipRemaining else onNext,
        nextLabel = if (quickWholePhotoPath) {
            "전체사진 1장으로 진행 · 나머지 패스"
        } else {
            nextLabel
        },
    )
}
