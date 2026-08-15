package com.eighty.windowcheck.data

import com.eighty.windowcheck.model.CapturedPhoto
import com.eighty.windowcheck.model.DiagnosisFinding
import com.eighty.windowcheck.model.DiagnosisResult
import com.eighty.windowcheck.model.FindingLevel
import kotlinx.coroutines.delay

interface DiagnosisRepository {
    suspend fun analyze(photos: List<CapturedPhoto>): DiagnosisResult
}

class FakeDiagnosisRepository : DiagnosisRepository {
    override suspend fun analyze(photos: List<CapturedPhoto>): DiagnosisResult {
        require(photos.isNotEmpty()) { "진단할 사진이 필요합니다." }
        delay(2_400)

        return DiagnosisResult(
            grade = "C",
            gradeTitle = "전문가 점검 권장",
            confidence = 78,
            summary = "실리콘과 창틀 하부에서 노후 흔적이 관찰됩니다. 사진만으로 교체 여부를 확정하지 않고, 현장 점검 후 부분 보수와 교체를 비교하는 것이 좋습니다.",
            findings = listOf(
                DiagnosisFinding(
                    title = "프레임 상태",
                    level = FindingLevel.GOOD,
                    summary = "사진에서 큰 파손이나 심한 휨은 확인되지 않습니다.",
                    recommendation = "개폐 상태와 잠금 밀착 정도를 현장에서 추가 확인하세요.",
                ),
                DiagnosisFinding(
                    title = "유리 상태",
                    level = FindingLevel.CHECK,
                    summary = "유리 가장자리의 내부 김서림 여부는 사진만으로 확정하기 어렵습니다.",
                    recommendation = "복층유리 내부 습기인지 표면 결로인지 현장에서 구분하세요.",
                ),
                DiagnosisFinding(
                    title = "실리콘 상태",
                    level = FindingLevel.POOR,
                    summary = "하부 모서리에서 갈라짐과 들뜸으로 보이는 흔적이 있습니다.",
                    recommendation = "실리콘 재시공 가능 여부와 외부 코킹 상태를 점검하세요.",
                ),
                DiagnosisFinding(
                    title = "결로 위험",
                    level = FindingLevel.CAUTION,
                    summary = "하부 물자국과 오염 흔적이 보여 결로 또는 누수 가능성을 함께 확인해야 합니다.",
                    recommendation = "실내 습도, 발생 시간, 비 오는 날 증상을 함께 확인하세요.",
                ),
                DiagnosisFinding(
                    title = "누수 위험",
                    level = FindingLevel.CHECK,
                    summary = "사진만으로 유입 경로는 확인할 수 없습니다.",
                    recommendation = "배수구 막힘, 외부 코킹, 벽체 유입을 순서대로 점검하세요.",
                ),
            ),
        )
    }
}
