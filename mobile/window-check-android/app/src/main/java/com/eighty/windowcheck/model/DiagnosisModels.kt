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
        instruction = "물방울, 물자국, 곰팡이 또는 유리 주변 수분이 보이도록 촬영해 주세요.",
        shortLabel = "결로",
    ),
    INSULATED_GLASS_FOGGING(
        title = "복층유리 내부 김서림",
        instruction = "유리 표면을 닦은 뒤에도 남는 내부 습기나 김서림을 촬영해 주세요.",
        shortLabel = "유리김서림",
    ),
    EXTERIOR_LEAK(
        title = "외부 누수 의심",
        instruction = "비가 올 때 젖는 상부·측면·하부와 벽체 물자국을 촬영해 주세요.",
        shortLabel = "외부누수",
    ),
    DRAINAGE(
        title = "배수·하부 물고임",
        instruction = "하부 레일, 배수구, 물고임과 물 흐름 흔적이 보이도록 촬영해 주세요.",
        shortLabel = "배수",
    ),
    SEALANT(
        title = "실리콘·외부 코킹",
        instruction = "갈라짐, 들뜸, 끊김과 벽체 접합부가 보이도록 가까이 촬영해 주세요.",
        shortLabel = "코킹",
    ),
    FRAME_DAMAGE(
        title = "프레임·창짝 이상",
        instruction = "파손, 변형, 처짐, 벌어짐이 보이는 부위를 촬영해 주세요.",
        shortLabel = "프레임",
    ),
    HARDWARE_DAMAGE(
        title = "손잡이·잠금 이상",
        instruction = "파손되거나 작동하지 않는 손잡이와 잠금부위를 촬영해 주세요.",
        shortLabel = "하드웨어",
    ),
    WALL_JOINT(
        title = "창호·벽체 접합부",
        instruction = "창 상부와 좌우 측면, 도배·몰딩 변색을 함께 촬영해 주세요.",
        shortLabel = "벽체접합",
    ),
    OTHER(
        title = "기타 이상",
        instruction = "소음 원인, 부식 등 추가로 확인할 부분을 촬영해 주세요.",
        shortLabel = "기타",
    ),
}

enum class InspectionMode(
    val label: String,
    val description: String,
) {
    SIMPLE(
        label = "간편 점검",
        description = "창호 전체 사진 1장을 우선 등록하고 필요한 세부사진만 추가합니다.",
    ),
    DETAILED(
        label = "정밀 점검",
        description = "세부 부위를 순서대로 확인하되 불필요한 항목은 사유를 남기고 건너뜁니다.",
    ),
}

enum class PhotoCaptureStatus(
    val label: String,
) {
    SKIPPED("촬영 생략"),
    DEFERRED("나중에 촬영"),
    NOT_APPLICABLE("해당 없음"),
}

enum class CaptureSkipReason(
    val label: String,
) {
    COVERED_BY_WHOLE_PHOTO("전체사진으로 확인 가능"),
    NO_VISIBLE_ISSUE("육안상 이상 없음"),
    NOT_NEEDED_ON_SITE("현장상 불필요"),
    CUSTOMER_REQUEST("고객 요청상 생략"),
    DETAILED_CHECK_LATER("정밀점검 시 추가 예정"),
    CANNOT_CAPTURE_SAFELY("안전상 촬영 불가"),
    OTHER("기타"),
}

data class WindowLocation(
    val id: String,
    val name: String,
    val note: String = "",
    val spaceName: String = "",
    val unitName: String = "",
)

data class PhotoSlotKey(
    val locationId: String,
    val type: CaptureType,
    val sequence: Int = 0,
)

data class EvidenceSlotKey(
    val locationId: String,
    val type: EvidenceType,
    val sequence: Int = 0,
)

data class CapturedPhoto(
    val locationId: String,
    val locationName: String,
    val type: CaptureType,
    val uri: Uri,
    val sequence: Int = 0,
    val description: String = "",
)

data class PhotoCaptureDecision(
    val locationId: String,
    val locationName: String,
    val type: CaptureType,
    val status: PhotoCaptureStatus,
    val reason: CaptureSkipReason,
    val reasonText: String = "",
)

data class EvidencePhoto(
    val locationId: String,
    val locationName: String,
    val type: EvidenceType,
    val uri: Uri,
    val sequence: Int = 0,
    val description: String = "",
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
    val aiMode: String = "mock",
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
    val inspectionMode: InspectionMode = InspectionMode.SIMPLE,
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
    val correctionType: String = "partially_corrected",
    val quoteRequired: Boolean = false,
    val measurementRequired: Boolean = false,
    val revisitRequired: Boolean = false,
    val confirmed: Boolean = false,
)

data class QuoteAttachment(
    val uri: Uri,
    val displayName: String,
)

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
