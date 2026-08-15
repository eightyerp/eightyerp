package com.eighty.windowcheck.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.text.input.KeyboardOptions
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.input.KeyboardType
import com.eighty.windowcheck.model.DiagnosisFinding
import com.eighty.windowcheck.model.DiagnosisResult
import com.eighty.windowcheck.model.ExtraInfo
import com.eighty.windowcheck.model.VisitRequest
import com.eighty.windowcheck.ui.components.AppHeader
import com.eighty.windowcheck.ui.components.FindingStatus
import com.eighty.windowcheck.ui.components.GradeBadge
import com.eighty.windowcheck.ui.components.InfoPill
import com.eighty.windowcheck.ui.components.MetricBar
import com.eighty.windowcheck.ui.components.PrimaryButton
import com.eighty.windowcheck.ui.components.SecondaryButton
import com.eighty.windowcheck.ui.components.SectionCard
import com.eighty.windowcheck.ui.theme.EightyBlue
import com.eighty.windowcheck.ui.theme.EightyDanger
import com.eighty.windowcheck.ui.theme.EightyMuted
import com.eighty.windowcheck.ui.theme.EightyNavy
import com.eighty.windowcheck.ui.theme.EightySky

@Composable
fun ResultSummaryScreen(
    result: DiagnosisResult,
    onBack: () -> Unit,
    onDetail: () -> Unit,
    onVisit: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "진단 결과", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 10.dp),
        ) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF7F7)),
            ) {
                Row(
                    modifier = Modifier.padding(20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    GradeBadge(grade = result.grade)
                    Column(modifier = Modifier.padding(start = 16.dp).weight(1f)) {
                        Text(
                            text = "종합 진단 등급",
                            style = MaterialTheme.typography.labelMedium,
                            color = EightyMuted,
                        )
                        Text(
                            text = result.gradeTitle,
                            modifier = Modifier.padding(top = 3.dp),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Black,
                            color = EightyDanger,
                        )
                        Text(
                            text = "AI 신뢰도 ${result.confidence}% · 전문가 검토 전",
                            modifier = Modifier.padding(top = 6.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyMuted,
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(14.dp))
            SectionCard {
                Text(
                    text = "진단 요약",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    text = result.summary,
                    modifier = Modifier.padding(top = 10.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = EightyMuted,
                )
            }
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = "항목별 예비진단",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.ExtraBold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            SectionCard {
                result.findings.forEachIndexed { index, finding ->
                    FindingRow(finding = finding)
                    if (index != result.findings.lastIndex) {
                        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                    }
                }
            }
            Spacer(modifier = Modifier.height(18.dp))
            PrimaryButton(text = "상세 결과 보기", onClick = onDetail)
            Spacer(modifier = Modifier.height(10.dp))
            SecondaryButton(text = "무료 방문 점검 신청", onClick = onVisit)
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@Composable
private fun FindingRow(finding: DiagnosisFinding) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = finding.title,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold,
        )
        FindingStatus(level = finding.level)
    }
}

@Composable
fun DetailResultScreen(
    result: DiagnosisResult,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "상세 결과", onBack = onBack)
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(result.findings) { finding ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = finding.title,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        FindingStatus(level = finding.level)
                    }
                    Text(
                        text = finding.summary,
                        modifier = Modifier.padding(top = 10.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = EightyMuted,
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp)
                            .background(EightySky, RoundedCornerShape(12.dp))
                            .padding(12.dp),
                    ) {
                        Text(
                            text = "권장 확인: ${finding.recommendation}",
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyNavy,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
            item {
                PrimaryButton(text = "추가 정보 입력", onClick = onNext)
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExtraInfoScreen(
    info: ExtraInfo,
    onInfoChange: (ExtraInfo) -> Unit,
    onBack: () -> Unit,
    onSubmit: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "추가 정보 입력", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 10.dp),
        ) {
            Text(
                text = "더 정확한 판단을 위해\n현재 증상을 알려주세요.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "사진만으로 확인하기 어려운 외풍·결로·개폐 상태를 함께 반영합니다.",
                modifier = Modifier.padding(top = 8.dp, bottom = 20.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )

            ChoiceSection(
                title = "창호 사용 연수",
                options = listOf("5년 미만", "5~10년", "10년 이상", "모름"),
                selected = info.yearsInUse,
                onSelected = { onInfoChange(info.copy(yearsInUse = it)) },
            )
            ChoiceSection(
                title = "외풍 체감 정도",
                options = listOf("거의 없음", "보통", "많이 느껴짐"),
                selected = info.draftLevel,
                onSelected = { onInfoChange(info.copy(draftLevel = it)) },
            )
            ChoiceSection(
                title = "겨울철 결로 발생",
                options = listOf("없음", "가끔 발생", "자주 발생"),
                selected = info.condensation,
                onSelected = { onInfoChange(info.copy(condensation = it)) },
            )
            ChoiceSection(
                title = "창 개폐 상태",
                options = listOf("부드러움", "보통", "뻑뻑함"),
                selected = info.openingCondition,
                onSelected = { onInfoChange(info.copy(openingCondition = it)) },
            )
            ChoiceSection(
                title = "거주 형태",
                options = listOf("아파트", "빌라", "단독주택", "기타"),
                selected = info.housingType,
                onSelected = { onInfoChange(info.copy(housingType = it)) },
            )

            Spacer(modifier = Modifier.height(4.dp))
            PrimaryButton(text = "종합 리포트 보기", onClick = onSubmit)
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChoiceSection(
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
                    selected = option == selected,
                    onClick = { onSelected(option) },
                    label = { Text(option, fontWeight = FontWeight.SemiBold) },
                )
            }
        }
    }
}

@Composable
fun ReportScreen(
    result: DiagnosisResult,
    info: ExtraInfo,
    onBack: () -> Unit,
    onSolution: () -> Unit,
    onVisit: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "종합 진단 리포트", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 10.dp),
        ) {
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    GradeBadge(grade = result.grade)
                    Column(modifier = Modifier.padding(start = 16.dp).weight(1f)) {
                        Text(
                            text = result.gradeTitle,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Black,
                            color = EightyDanger,
                        )
                        Text(
                            text = "AI 예비진단 + 사용자 증상 입력",
                            modifier = Modifier.padding(top = 4.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyMuted,
                        )
                    }
                }
                Spacer(modifier = Modifier.height(20.dp))
                MetricBar(label = "프레임 상태", value = 0.72f)
                Spacer(modifier = Modifier.height(12.dp))
                MetricBar(label = "기밀 상태", value = 0.42f)
                Spacer(modifier = Modifier.height(12.dp))
                MetricBar(label = "실리콘 상태", value = 0.31f)
                Spacer(modifier = Modifier.height(12.dp))
                MetricBar(label = "결로 위험", value = 0.38f)
                Spacer(modifier = Modifier.height(12.dp))
                MetricBar(label = "수밀 상태", value = 0.48f)
            }
            Spacer(modifier = Modifier.height(14.dp))
            SectionCard {
                Text(
                    text = "입력한 증상",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                )
                Row(
                    modifier = Modifier.padding(top = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    InfoPill(text = info.yearsInUse)
                    InfoPill(text = info.housingType)
                }
                Row(
                    modifier = Modifier.padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    InfoPill(text = info.draftLevel)
                    InfoPill(text = info.condensation)
                }
            }
            Spacer(modifier = Modifier.height(14.dp))
            SectionCard {
                Text(
                    text = "주요 진단 요약",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                )
                val bullets = listOf(
                    "실리콘 노후 흔적이 있어 부분 보수 가능 여부 확인",
                    "결로와 누수 흔적을 구분하기 위한 현장 점검 필요",
                    "외풍 체감이 커 기밀 상태와 창짝 조정 확인",
                    "사진만으로 전체 교체 여부는 확정하지 않음",
                )
                bullets.forEach { bullet ->
                    Row(modifier = Modifier.padding(top = 10.dp)) {
                        Text(text = "✓", color = EightyBlue, fontWeight = FontWeight.Black)
                        Text(
                            text = bullet,
                            modifier = Modifier.padding(start = 8.dp).weight(1f),
                            style = MaterialTheme.typography.bodyMedium,
                            color = EightyMuted,
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(18.dp))
            PrimaryButton(text = "추천 솔루션 보기", onClick = onSolution)
            Spacer(modifier = Modifier.height(10.dp))
            SecondaryButton(text = "방문 점검 신청", onClick = onVisit)
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@Composable
fun SolutionScreen(
    onBack: () -> Unit,
    onVisit: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "추천 솔루션", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 10.dp),
        ) {
            Text(
                text = "현재 상태에 맞는\n점검 순서를 제안합니다.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "무조건 교체를 권하지 않고, 관리·부분 보수·유리 또는 부품 교체·전체 교체 순서로 비교합니다.",
                modifier = Modifier.padding(top = 8.dp, bottom = 18.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )

            val steps = listOf(
                "1" to ("배수구·레일 청소" to "하부 오염과 배수 상태를 먼저 확인합니다."),
                "2" to ("창짝·잠금 조정" to "개폐와 밀착 불량이 조정으로 개선되는지 확인합니다."),
                "3" to ("실리콘 부분 보수" to "갈라짐 범위와 외부 코킹 상태를 함께 확인합니다."),
                "4" to ("유리·부품 교체 검토" to "복층유리 내부 습기나 하드웨어 손상 시 단품 교체를 비교합니다."),
                "5" to ("전체 창호 교체 상담" to "사용연수와 복합 증상이 큰 경우에만 현장 실측 후 검토합니다."),
            )
            steps.forEach { (number, pair) ->
                SectionCard(modifier = Modifier.padding(bottom = 10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .background(EightyBlue, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(number, color = Color.White, fontWeight = FontWeight.Black)
                        }
                        Column(modifier = Modifier.padding(start = 12.dp).weight(1f)) {
                            Text(
                                text = pair.first,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.ExtraBold,
                            )
                            Text(
                                text = pair.second,
                                modifier = Modifier.padding(top = 4.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = EightyMuted,
                            )
                        }
                    }
                }
            }

            SectionCard(modifier = Modifier.padding(top = 4.dp)) {
                Text(
                    text = "교체가 필요한 경우",
                    style = MaterialTheme.typography.labelLarge,
                    color = EightyBlue,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    text = "LX Z:IN 뷰프레임 등 현장 조건에 맞는 제품을 실측 후 비교 제안합니다.",
                    modifier = Modifier.padding(top = 8.dp),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Black,
                    color = EightyNavy,
                )
                Text(
                    text = "제품과 사양은 설치 위치, 창 크기, 확장 여부, 유리 구성에 따라 달라집니다.",
                    modifier = Modifier.padding(top = 8.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = EightyMuted,
                )
            }
            Spacer(modifier = Modifier.height(18.dp))
            PrimaryButton(text = "상담·견적 요청하기", onClick = onVisit)
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@Composable
fun VisitRequestScreen(
    request: VisitRequest,
    onRequestChange: (VisitRequest) -> Unit,
    onBack: () -> Unit,
    onSubmit: () -> Unit,
) {
    val valid = request.name.isNotBlank() && request.phone.length >= 9 && request.address.isNotBlank()
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "방문 상담 신청", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 10.dp),
        ) {
            Text(
                text = "무료 방문 점검을\n신청해 보세요.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "에잇티 담당자가 연락드린 뒤 일정을 확정합니다.",
                modifier = Modifier.padding(top = 8.dp, bottom = 18.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )

            OutlinedTextField(
                value = request.name,
                onValueChange = { onRequestChange(request.copy(name = it)) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("이름") },
                singleLine = true,
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = request.phone,
                onValueChange = { value ->
                    onRequestChange(request.copy(phone = value.filter(Char::isDigit).take(11)))
                },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("연락처") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = request.address,
                onValueChange = { onRequestChange(request.copy(address = it)) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("현장 주소") },
                minLines = 2,
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = request.preferredTime,
                onValueChange = { onRequestChange(request.copy(preferredTime = it)) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("희망 연락 시간") },
                placeholder = { Text("예: 평일 오후 2시 이후") },
                singleLine = true,
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = request.note,
                onValueChange = { onRequestChange(request.copy(note = it)) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("문의 사항(선택)") },
                placeholder = { Text("예: 거실 창호 외풍이 심합니다.") },
                minLines = 4,
            )
            Spacer(modifier = Modifier.height(16.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF2F6FC), RoundedCornerShape(14.dp))
                    .padding(14.dp),
            ) {
                Text(
                    text = "내부 MVP에서는 신청 내용을 기기 화면에만 확인합니다. ERP 자동 등록은 다음 단계에서 연결합니다.",
                    style = MaterialTheme.typography.bodySmall,
                    color = EightyMuted,
                )
            }
            Spacer(modifier = Modifier.height(18.dp))
            PrimaryButton(
                text = "신청 저장",
                onClick = onSubmit,
                enabled = valid,
            )
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@Composable
fun CompleteScreen(
    onRestart: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(modifier = Modifier.weight(1f))
        Box(
            modifier = Modifier
                .size(96.dp)
                .background(EightyBlue, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "✓",
                color = Color.White,
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.Black,
            )
        }
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = "내부 상담 신청이\n저장되었습니다.",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Black,
            textAlign = TextAlign.Center,
            color = EightyNavy,
        )
        Text(
            text = "다음 개발 단계에서 ERP 고객 리드와 담당자 알림으로 자동 연결합니다.",
            modifier = Modifier.padding(top = 12.dp),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = EightyMuted,
        )
        Spacer(modifier = Modifier.weight(1f))
        PrimaryButton(text = "새 진단 시작", onClick = onRestart)
    }
}

@Composable
fun HistoryPlaceholderScreen(
    onBack: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "진단 기록", onBack = onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "진단 기록 저장은\nERP 연동 단계에서 열립니다.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
                color = EightyNavy,
            )
            Text(
                text = "1차 버전에서는 촬영·예비진단·리포트 화면을 먼저 검증합니다.",
                modifier = Modifier.padding(top = 12.dp),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = EightyMuted,
            )
        }
    }
}
