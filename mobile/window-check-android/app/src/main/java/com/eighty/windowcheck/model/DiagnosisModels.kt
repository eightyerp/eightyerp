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

data class CapturedPhoto(
    val type: CaptureType,
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

data class DiagnosisResult(
    val grade: String,
    val gradeTitle: String,
    val confidence: Int,
    val summary: String,
    val findings: List<DiagnosisFinding>,
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
