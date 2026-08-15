package com.eighty.windowcheck.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.eighty.windowcheck.model.DiagnosisResult
import com.eighty.windowcheck.model.InspectionSetup
import com.eighty.windowcheck.model.LocationCondition
import com.eighty.windowcheck.model.QuoteAttachment
import com.eighty.windowcheck.model.StaffReview
import com.eighty.windowcheck.model.WindowLocation
import com.eighty.windowcheck.ui.components.AppHeader
import com.eighty.windowcheck.ui.components.FindingStatus
import com.eighty.windowcheck.ui.components.GradeBadge
import com.eighty.windowcheck.ui.components.InfoPill
import com.eighty.windowcheck.ui.components.PrimaryButton
import com.eighty.windowcheck.ui.components.SecondaryButton
import com.eighty.windowcheck.ui.components.SectionCard
import com.eighty.windowcheck.ui.theme.EightyBlue
import com.eighty.windowcheck.ui.theme.EightyDanger
import com.eighty.windowcheck.ui.theme.EightyMuted
import com.eighty.windowcheck.ui.theme.EightyNavy

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LocationConditionScreen(
    condition: LocationCondition,
    currentIndex: Int,
    totalCount: Int,
    onConditionChange: (LocationCondition) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(
            title = "증상 확인 ${currentIndex + 1} / $totalCount",
            onBack = onBack,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            Text(
                text = condition.locationName,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "사진만으로 확인하기 어려운 결로·누수 발생 조건을 직원이 고객에게 확인해 주세요.",
                modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )

            ConditionChoice(
                title = "창호 사용 연수",
                options = listOf("5년 미만", "5~10년", "10~20년", "20년 이상", "모름"),
                selected = condition.yearsInUse,
                onSelected = { onConditionChange(condition.copy(yearsInUse = it)) },
            )
            ConditionChoice(
                title = "외풍 체감",
                options = listOf("거의 없음", "보통", "많이 느껴짐"),
                selected = condition.draftLevel,
                onSelected = { onConditionChange(condition.copy(draftLevel = it)) },
            )
            ConditionChoice(
                title = "결로 발생 빈도",
                options = listOf("없음", "가끔", "자주", "복층유리 내부 김서림 의심"),
                selected = condition.condensation,
                onSelected = { onConditionChange(condition.copy(condensation = it)) },
            )
            ConditionChoice(
                title = "결로 발생 위치",
                options = listOf("해당 없음", "유리면", "창틀", "벽체·도배", "여러 곳"),
                selected = condition.condensationArea,
                onSelected = { onConditionChange(condition.copy(condensationArea = it)) },
            )
            ConditionChoice(
                title = "비 오는 날 누수",
                options = listOf("없음", "가끔", "강한 비에 발생", "비가 오면 자주 발생"),
                selected = condition.exteriorLeak,
                onSelected = { onConditionChange(condition.copy(exteriorLeak = it)) },
            )
            ConditionChoice(
                title = "누수 의심 위치",
                options = listOf("해당 없음", "상부", "측면", "창틀 하부", "벽체", "모름"),
                selected = condition.leakArea,
                onSelected = { onConditionChange(condition.copy(leakArea = it)) },
            )
            ConditionChoice(
                title = "창 개폐 상태",
                options = listOf("부드러움", "보통", "뻑뻑함", "잠금 불량"),
                selected = condition.openingCondition,
                onSelected = { onConditionChange(condition.copy(openingCondition = it)) },
            )
            ConditionChoice(
                title = "외부 소음 체감",
                options = listOf("양호", "보통", "크게 들림"),
                selected = condition.noiseLevel,
                onSelected = { onConditionChange(condition.copy(noiseLevel = it)) },
            )
            ConditionChoice(
                title = "곰팡이·물때",
                options = listOf("없음", "조금 있음", "심함"),
                selected = condition.moldCondition,
                onSelected = { onConditionChange(condition.copy(moldCondition = it)) },
            )
            SectionCard(modifier = Modifier.padding(bottom = 12.dp)) {
                Text(
                    text = "기타 증상 및 직원 메모",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.ExtraBold,
                )
                OutlinedTextField(
                    value = condition.otherIssue,
                    onValueChange = { onConditionChange(condition.copy(otherIssue = it)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp),
                    minLines = 3,
                    label = { Text("파손·소음·누수 시점 등") },
                    shape = RoundedCornerShape(14.dp),
                )
            }

            PrimaryButton(
                text = if (currentIndex >= totalCount - 1) "AI 예비진단 시작" else "다음 위치 문답",
                onClick = onNext,
            )
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ConditionChoice(
    title: String,
    options: List<String>,
    selected: String,
    onSelected: (String) -> Unit,
) {
    SectionCard(modifier = Modifier.padding(bottom = 12.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.ExtraBold,
        )
        FlowRow(
            modifier = Modifier.padding(top = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            options.forEach { option ->
                FilterChip(
                    selected = selected == option,
                    onClick = { onSelected(option) },
                    label = { Text(option, fontWeight = FontWeight.SemiBold) },
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StaffReviewScreen(
    result: DiagnosisResult,
    review: StaffReview,
    onReviewChange: (StaffReview) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    val recommendations = listOf(
        "관리·청소 안내",
        "부분 보수 점검",
        "유리·부품 교체 검토",
        "전체 창호 교체 검토",
        "추가 현장점검 필요",
    )

    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "직원 최종 검토", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    GradeBadge(grade = result.grade)
                    Column(modifier = Modifier.padding(start = 14.dp).weight(1f)) {
                        Text(
                            text = result.gradeTitle,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Black,
                            color = EightyDanger,
                        )
                        Text(
                            text = "AI 신뢰도 ${result.confidence}% · 고객 발송 전 직원 확인 필수",
                            modifier = Modifier.padding(top = 4.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyMuted,
                        )
                    }
                }
                Text(
                    text = result.summary,
                    modifier = Modifier.padding(top = 14.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = EightyMuted,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))

            result.locations.forEach { location ->
                SectionCard(modifier = Modifier.padding(bottom = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = location.locationName,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Black,
                        )
                        InfoPill(text = "${location.grade} · ${location.gradeTitle}")
                    }
                    Text(
                        text = location.summary,
                        modifier = Modifier.padding(top = 10.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = EightyMuted,
                    )
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                    location.findings.take(4).forEach { finding ->
                        Row(
                            modifier = Modifier.padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = finding.title,
                                modifier = Modifier.weight(1f),
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                            FindingStatus(level = finding.level)
                        }
                    }
                }
            }

            SectionCard {
                Text(
                    text = "직원 권장 조치",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                )
                FlowRow(
                    modifier = Modifier.padding(top = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    recommendations.forEach { recommendation ->
                        FilterChip(
                            selected = review.recommendation == recommendation,
                            onClick = {
                                onReviewChange(review.copy(recommendation = recommendation))
                            },
                            label = { Text(recommendation, fontWeight = FontWeight.SemiBold) },
                        )
                    }
                }
                OutlinedTextField(
                    value = review.customerComment,
                    onValueChange = { onReviewChange(review.copy(customerComment = it)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                    minLines = 3,
                    label = { Text("고객 전달 의견") },
                    shape = RoundedCornerShape(14.dp),
                )
                OutlinedTextField(
                    value = review.internalMemo,
                    onValueChange = { onReviewChange(review.copy(internalMemo = it)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp),
                    minLines = 2,
                    label = { Text("사내 메모 · 고객 리포트에는 미표시") },
                    shape = RoundedCornerShape(14.dp),
                )
            }
            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFEAF7EF), RoundedCornerShape(14.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = review.confirmed,
                    onCheckedChange = { onReviewChange(review.copy(confirmed = it)) },
                )
                Text(
                    text = "사진과 문답, AI 예비진단을 확인했으며 고객 전달용 의견을 최종 검토했습니다.",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = EightyNavy,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            PrimaryButton(
                text = "고객용 점검 리포트 만들기",
                onClick = onNext,
                enabled = review.confirmed,
            )
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
fun CustomerReportScreen(
    setup: InspectionSetup,
    locations: List<WindowLocation>,
    conditions: List<LocationCondition>,
    result: DiagnosisResult,
    review: StaffReview,
    standardPhotoCount: Int,
    evidencePhotoCount: Int,
    quoteAttachment: QuoteAttachment?,
    onBack: () -> Unit,
    onAttachQuote: () -> Unit,
    onShare: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "고객용 점검 리포트", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            Text(
                text = "창호 점검 리포트",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "보이는 디자인, 보이지 않는 기준.",
                modifier = Modifier.padding(top = 4.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyBlue,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(14.dp))

            SectionCard {
                ReportLine(label = "고객명", value = setup.customer.name)
                ReportLine(
                    label = "현장",
                    value = listOf(setup.customer.address, setup.customer.detailAddress)
                        .filter { it.isNotBlank() }
                        .joinToString(" "),
                )
                ReportLine(
                    label = "점검 담당",
                    value = listOf(setup.inspector.name, setup.inspector.teamPosition)
                        .filter { it.isNotBlank() }
                        .joinToString(" · "),
                )
                ReportLine(label = "점검 위치", value = locations.joinToString { it.name })
                ReportLine(
                    label = "등록 사진",
                    value = "기본 ${standardPhotoCount}장 · 증상 ${evidencePhotoCount}장",
                )
            }
            Spacer(modifier = Modifier.height(12.dp))

            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    GradeBadge(grade = result.grade)
                    Column(modifier = Modifier.padding(start = 14.dp).weight(1f)) {
                        Text(
                            text = result.gradeTitle,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Black,
                            color = EightyDanger,
                        )
                        Text(
                            text = "직원 검토 완료 · ${review.recommendation}",
                            modifier = Modifier.padding(top = 4.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyMuted,
                        )
                    }
                }
                Text(
                    text = result.summary,
                    modifier = Modifier.padding(top = 14.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = EightyMuted,
                )
                if (review.customerComment.isNotBlank()) {
                    Text(
                        text = review.customerComment,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp)
                            .background(Color(0xFFEAF2FF), RoundedCornerShape(12.dp))
                            .padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = EightyNavy,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            Spacer(modifier = Modifier.height(12.dp))

            result.locations.forEach { locationResult ->
                val condition = conditions.firstOrNull { it.locationId == locationResult.locationId }
                SectionCard(modifier = Modifier.padding(bottom = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = locationResult.locationName,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Black,
                        )
                        InfoPill(text = "${locationResult.grade}등급")
                    }
                    Text(
                        text = locationResult.summary,
                        modifier = Modifier.padding(top = 8.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = EightyMuted,
                    )
                    if (condition != null) {
                        Row(
                            modifier = Modifier.padding(top = 10.dp),
                            horizontalArrangement = Arrangement.spacedBy(7.dp),
                        ) {
                            InfoPill(text = "결로 ${condition.condensation}")
                            InfoPill(text = "누수 ${condition.exteriorLeak}")
                        }
                    }
                }
            }

            SectionCard {
                Text(
                    text = "견적서 첨부",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    text = quoteAttachment?.displayName
                        ?: "현재 견적서가 첨부되지 않았습니다. ERP 견적 PDF를 선택하면 리포트와 함께 발송됩니다.",
                    modifier = Modifier.padding(top = 8.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = EightyMuted,
                )
                Spacer(modifier = Modifier.height(10.dp))
                SecondaryButton(
                    text = if (quoteAttachment == null) "견적서 PDF 첨부" else "견적서 교체",
                    onClick = onAttachQuote,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = "본 리포트는 사진과 고객 증상을 바탕으로 작성한 예비점검 자료입니다. 누수 원인과 교체 필요 여부는 현장 조건 및 추가 점검 후 확정됩니다.",
                style = MaterialTheme.typography.bodySmall,
                color = EightyMuted,
            )
            Spacer(modifier = Modifier.height(14.dp))
            PrimaryButton(
                text = if (quoteAttachment == null) {
                    "점검 리포트 발행·공유"
                } else {
                    "리포트 + 견적 함께 발송"
                },
                onClick = onShare,
            )
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@Composable
private fun ReportLine(
    label: String,
    value: String,
) {
    Row(modifier = Modifier.padding(vertical = 4.dp)) {
        Text(
            text = label,
            modifier = Modifier.weight(0.32f),
            style = MaterialTheme.typography.bodySmall,
            color = EightyMuted,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = value.ifBlank { "-" },
            modifier = Modifier.weight(0.68f),
            style = MaterialTheme.typography.bodySmall,
            color = EightyNavy,
            fontWeight = FontWeight.Bold,
        )
    }
}
