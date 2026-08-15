package com.eighty.windowcheck.data

import com.eighty.windowcheck.model.CapturedPhoto
import com.eighty.windowcheck.model.DiagnosisFinding
import com.eighty.windowcheck.model.DiagnosisResult
import com.eighty.windowcheck.model.EvidencePhoto
import com.eighty.windowcheck.model.EvidenceType
import com.eighty.windowcheck.model.FindingLevel
import com.eighty.windowcheck.model.LocationDiagnosisResult
import kotlinx.coroutines.delay

interface DiagnosisRepository {
    suspend fun analyze(
        photos: List<CapturedPhoto>,
        evidencePhotos: List<EvidencePhoto> = emptyList(),
    ): DiagnosisResult
}

class FakeDiagnosisRepository : DiagnosisRepository {
    override suspend fun analyze(
        photos: List<CapturedPhoto>,
        evidencePhotos: List<EvidencePhoto>,
    ): DiagnosisResult {
        require(photos.isNotEmpty()) { "진단할 사진이 필요합니다." }
        delay(2_400)

        val groupedPhotos = photos.groupBy { it.locationId }
        val groupedEvidence = evidencePhotos.groupBy { it.locationId }

        val locationResults = groupedPhotos.entries.mapIndexed { index, (locationId, locationPhotos) ->
            val locationName = locationPhotos.first().locationName
            val evidenceTypes = groupedEvidence[locationId].orEmpty().map { it.type }.toSet()
            val hasCondensation = EvidenceType.CONDENSATION in evidenceTypes
            val hasExteriorLeak = EvidenceType.EXTERIOR_LEAK in evidenceTypes
            val hasOther = EvidenceType.OTHER in evidenceTypes

            val grade = when {
                hasExteriorLeak -> "D"
                hasCondensation || index == 0 -> "C"
                else -> "B"
            }
            val gradeTitle = when (grade) {
                "D" -> "우선 현장점검 필요"
                "C" -> "전문가 점검 권장"
                else -> "관리·부분점검 권장"
            }

            val findings = listOf(
                DiagnosisFinding(
                    title = "프레임 상태",
                    level = if (hasOther) FindingLevel.CHECK else FindingLevel.GOOD,
                    summary = if (hasOther) {
                        "기타 이상 사진이 등록되어 프레임 파손·뒤틀림 여부를 추가 확인해야 합니다."
                    } else {
                        "등록 사진에서 큰 파손이나 심한 휨은 뚜렷하게 확인되지 않습니다."
                    },
                    recommendation = "개폐 상태, 창짝 처짐, 잠금 밀착 정도를 직원이 현장에서 확인하세요.",
                ),
                DiagnosisFinding(
                    title = "유리 상태",
                    level = if (hasCondensation) FindingLevel.CAUTION else FindingLevel.CHECK,
                    summary = if (hasCondensation) {
                        "결로 증상 사진이 등록되었습니다. 표면 결로와 복층유리 내부 습기를 구분해야 합니다."
                    } else {
                        "유리 파손은 뚜렷하지 않지만 내부 김서림 여부는 사진만으로 확정하기 어렵습니다."
                    },
                    recommendation = "유리 표면을 닦은 뒤에도 습기가 남는지 확인하고, 간봉 주변을 점검하세요.",
                ),
                DiagnosisFinding(
                    title = "실리콘·코킹 상태",
                    level = FindingLevel.POOR,
                    summary = "하부 또는 모서리에서 갈라짐과 들뜸으로 보이는 흔적이 있을 수 있습니다.",
                    recommendation = "실내 실리콘과 외부 코킹을 구분해 부분 보수 가능 범위를 확인하세요.",
                ),
                DiagnosisFinding(
                    title = "결로 위험",
                    level = if (hasCondensation) FindingLevel.CAUTION else FindingLevel.CHECK,
                    summary = if (hasCondensation) {
                        "결로 또는 물자국 증상이 등록되어 발생 위치·시간·실내 습도 확인이 필요합니다."
                    } else {
                        "현재 사진만으로 결로 발생 빈도와 원인을 확정할 수 없습니다."
                    },
                    recommendation = "유리면·창틀·벽체 중 발생 위치와 겨울철 실내 습도를 함께 기록하세요.",
                ),
                DiagnosisFinding(
                    title = "외부 누수 위험",
                    level = if (hasExteriorLeak) FindingLevel.POOR else FindingLevel.CHECK,
                    summary = if (hasExteriorLeak) {
                        "외부 누수 의심 사진이 등록되었습니다. 비가 올 때 유입되는 경로를 확인해야 합니다."
                    } else {
                        "사진만으로 외부 코킹·벽체·상부 유입 여부를 판단할 수 없습니다."
                    },
                    recommendation = "외부 코킹, 창 상부, 측벽 균열, 하부 배수 상태를 순서대로 점검하세요.",
                ),
                DiagnosisFinding(
                    title = "배수·하부 누수",
                    level = FindingLevel.CAUTION,
                    summary = "하부 레일의 물자국은 결로, 배수구 막힘, 외부 유입이 모두 원인일 수 있습니다.",
                    recommendation = "배수구 청소 후 물 흐름을 확인하고 비 오는 날 재점검하세요.",
                ),
                DiagnosisFinding(
                    title = "기타 이상",
                    level = if (hasOther) FindingLevel.CAUTION else FindingLevel.GOOD,
                    summary = if (hasOther) {
                        "직원이 추가 확인이 필요한 이상 사진을 등록했습니다."
                    } else {
                        "추가로 등록된 기타 이상 사진은 없습니다."
                    },
                    recommendation = "직원 검토 화면에서 고객에게 전달할 설명과 조치 의견을 작성하세요.",
                ),
            )

            LocationDiagnosisResult(
                locationId = locationId,
                locationName = locationName,
                grade = grade,
                gradeTitle = gradeTitle,
                summary = "$locationName 창호는 사진상 노후 흔적과 등록 증상을 기준으로 $gradeTitle 상태입니다. 사진만으로 교체를 확정하지 않고 직원 확인 후 리포트를 발행합니다.",
                findings = findings,
            )
        }

        val overallGrade = locationResults.minByOrNull { gradeRank(it.grade) }?.grade ?: "C"
        val overallTitle = when (overallGrade) {
            "D" -> "우선 현장점검 필요"
            "C" -> "전문가 점검 권장"
            else -> "관리·부분점검 권장"
        }

        val aggregateFindings = locationResults
            .flatMap { it.findings }
            .groupBy { it.title }
            .map { (_, findings) -> findings.maxBy { levelRank(it.level) } }

        return DiagnosisResult(
            grade = overallGrade,
            gradeTitle = overallTitle,
            confidence = 78,
            summary = "총 ${locationResults.size}개 위치를 점검했습니다. 결로·외부 누수·기타 증상 사진과 표준 촬영 사진을 위치별로 구분했으며, 최종 고객 전달 전 직원 검토가 필요합니다.",
            findings = aggregateFindings,
            locations = locationResults,
        )
    }

    private fun gradeRank(grade: String): Int = when (grade) {
        "E" -> 0
        "D" -> 1
        "C" -> 2
        "B" -> 3
        else -> 4
    }

    private fun levelRank(level: FindingLevel): Int = when (level) {
        FindingLevel.GOOD -> 0
        FindingLevel.CHECK -> 1
        FindingLevel.CAUTION -> 2
        FindingLevel.POOR -> 3
    }
}
