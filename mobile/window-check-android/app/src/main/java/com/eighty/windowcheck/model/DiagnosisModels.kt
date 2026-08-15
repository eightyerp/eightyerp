package com.eighty.windowcheck.model

import android.net.Uri

enum class CaptureType(
    val title: String,
    val instruction: String,
    val shortLabel: String,
) {
    WHOLE_WINDOW(
        title = "창호 전체",
        instruction = "창이 한 화면에 모두 들어오도록 정면에서 촬영해 주세요.",
        shortLabel = "전체",
    ),
    FRAME_CORNER(
        title = "창틀 모서리",
        instruction = "창짝 맞물림과 실리콘 모서리가 보이도록 가까이 촬영해 주세요.",
        shortLabel = "모서리",
    ),
    GLASS(
        title = "유리면",
        instruction = "유리 전체와 가장자리가 선명하게 보이도록 촬영해 주세요.",
        shortLabel = "유리",
    ),
    LOWER_RAIL(
        title = "창틀 하부",
        instruction = "레일, 배수구, 실리콘 부위가 보이도록 촬영해 주세요.",
        shortLabel = "하부",
    ),
    HANDLE_LOCK(
        title = "손잡이·잠금장치",
        instruction = "손잡이와 잠금장치의 현재 상태를 가까이 촬영해 주세요.",
        shortLabel = "손잡이",
    ),
}

enum class EvidenceType(
    val title: String,
    val instruction: String,
    val shortLabel: String,
) {
    CONDENSATION(
        title = "결로 증상",
        instruction = "물방울, 물자국, 곰팡이 또는 복층유리 내부 김서림이 보이도록 촬영해 주세요.",
        shortLabel = "결로",
    ),
    EXTERIOR_LEAK(
        title = "외부 누수 의심",
        instruction = "비가 올 때 젖는 상부·측면·하부와 벽체 물자국을 촬영해 주세요.",
        shortLabel = "외부누수",
    ),
    OTHER(
        title = "기타 이상",
        instruction = "파손, 뒤틀림, 소음 원인, 부식 등 추가로 확인할 부분을 촬영해 주세요.",
        shortLabel = "기타",
    ),
}

data class WindowLocation(
    val id: String,
    val name: String,
    val note: String = "",
)

data class PhotoSlotKey(
    val locationId: String,
    val type: CaptureType,
)

data class EvidenceSlotKey(
    val locationId: String,
    val type: EvidenceType,
)

data class CapturedPhoto(
    val locationId: String,
    val locationName: String,
    val type: CaptureType,
    val uri: Uri,
)

data class EvidencePhoto(
    val locationId: String,
    val locationName: String,
    val type: EvidenceType,
    val uri: Uri,
)

enum class FindingLevel(
    val label: String,
) {
    GOOD("양호"),
    CHECK("확인 필요"),
    CAUTION("주의"),
    POOR("불량 의심"),
}

data class DiagnosisFinding(
    val title: String,
    val level: FindingLevel,
    val summary: String,
    val recommendation: String,
)

data class LocationDiagnosisResult(
    val locationId: String,
    val locationName: String,
    val grade: String,
    val gradeTitle: String,
    val summary: String,
    val findings: List<DiagnosisFinding>,
)

data class DiagnosisResult(
    val grade: String,
    val gradeTitle: String,
    val confidence: Int,
    val summary: String,
    val findings: List<DiagnosisFinding>,
    val locations: List<LocationDiagnosisResult> = emptyList(),
)

data class CustomerInfo(
    val name: String = "",
    val phone: String = "",
    val address: String = "",
    val detailAddress: String = "",
)

data class InspectorInfo(
    val name: String = "",
    val teamPosition: String = "",
    val phone: String = "",
)

data class InspectionSetup(
    val customer: CustomerInfo = CustomerInfo(),
    val inspector: InspectorInfo = InspectorInfo(),
)

data class LocationCondition(
    val locationId: String,
    val locationName: String,
    val yearsInUse: String = "모름",
    val draftLevel: String = "보통",
    val condensation: String = "없음",
    val condensationArea: String = "해당 없음",
    val exteriorLeak: String = "없음",
    val leakArea: String = "해당 없음",
    val openingCondition: String = "보통",
    val noiseLevel: String = "보통",
    val moldCondition: String = "없음",
    val otherIssue: String = "",
)

data class StaffReview(
    val recommendation: String = "부분 보수 점검",
    val customerComment: String = "",
    val internalMemo: String = "",
    val confirmed: Boolean = false,
)

data class QuoteAttachment(
    val uri: Uri,
    val displayName: String,
)

// 기존 화면과의 소스 호환을 위해 유지합니다. 신규 직원용 흐름은 LocationCondition을 사용합니다.
data class ExtraInfo(
    val yearsInUse: String = "10년 이상",
    val draftLevel: String = "많이 느껴짐",
    val condensation: String = "자주 발생",
    val openingCondition: String = "뻑뻑함",
    val housingType: String = "아파트",
)

data class VisitRequest(
    val name: String = "",
    val phone: String = "",
    val address: String = "",
    val preferredTime: String = "",
    val note: String = "",
)
