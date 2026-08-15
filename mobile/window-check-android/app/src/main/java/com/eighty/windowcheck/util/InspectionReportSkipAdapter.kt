package com.eighty.windowcheck.util

import android.content.Context
import com.eighty.windowcheck.model.CapturedPhoto
import com.eighty.windowcheck.model.DiagnosisResult
import com.eighty.windowcheck.model.EvidencePhoto
import com.eighty.windowcheck.model.InspectionSetup
import com.eighty.windowcheck.model.LocationCondition
import com.eighty.windowcheck.model.PhotoCaptureDecision
import com.eighty.windowcheck.model.StaffReview
import com.eighty.windowcheck.model.WindowLocation

/**
 * Report overload for the flexible capture flow.
 * The current PDF renderer is preserved, while a concise customer-facing
 * summary of skipped/deferred detail photos is appended to the final opinion.
 */
fun Context.generateInspectionReportPdf(
    setup: InspectionSetup,
    locations: List<WindowLocation>,
    photos: List<CapturedPhoto>,
    evidencePhotos: List<EvidencePhoto>,
    result: DiagnosisResult,
    conditions: List<LocationCondition>,
    review: StaffReview,
    captureDecisions: List<PhotoCaptureDecision>,
): GeneratedInspectionReport {
    val skipSummary = captureDecisions
        .groupBy { it.locationName }
        .entries
        .joinToString("\n") { (locationName, decisions) ->
            val details = decisions.joinToString(", ") { decision ->
                "${decision.type.title}(${decision.reason.label})"
            }
            "$locationName 촬영 생략: $details"
        }

    val customerComment = buildString {
        if (review.customerComment.isNotBlank()) {
            append(review.customerComment.trim())
        } else {
            append("위치별 점검 결과와 권장 조치를 확인해 주세요.")
        }
        if (skipSummary.isNotBlank()) {
            append("\n")
            append("점검 방식: ${setup.inspectionMode.label}. ")
            append("세부사진이 생략된 항목은 다음과 같습니다.\n")
            append(skipSummary)
        }
    }

    return generateInspectionReportPdf(
        setup = setup,
        locations = locations,
        photos = photos,
        evidencePhotos = evidencePhotos,
        result = result,
        conditions = conditions,
        review = review.copy(customerComment = customerComment),
    )
}
