package com.eighty.windowcheck.ui.screens

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.eighty.windowcheck.model.CustomerInfo
import com.eighty.windowcheck.model.DiagnosisResult
import com.eighty.windowcheck.model.EvidenceType
import com.eighty.windowcheck.model.InspectionSetup
import com.eighty.windowcheck.model.InspectorInfo
import com.eighty.windowcheck.model.LocationCondition
import com.eighty.windowcheck.model.QuoteAttachment
import com.eighty.windowcheck.model.StaffReview
import com.eighty.windowcheck.model.WindowLocation
import com.eighty.windowcheck.ui.components.AppHeader
import com.eighty.windowcheck.ui.components.FindingStatus
import com.eighty.windowcheck.ui.components.GradeBadge
import com.eighty.windowcheck.ui.components.PrimaryButton
import com.eighty.windowcheck.ui.components.SecondaryButton
import com.eighty.windowcheck.ui.components.SectionCard
import com.eighty.windowcheck.ui.theme.EightyBlue
import com.eighty.windowcheck.ui.theme.EightyDanger
import com.eighty.windowcheck.ui.theme.EightyMuted
import com.eighty.windowcheck.ui.theme.EightyNavy
import com.eighty.windowcheck.ui.theme.EightySky
import com.eighty.windowcheck.util.ContentUriImage
import com.eighty.windowcheck.util.GeneratedInspectionReport

@Composable
fun InspectionSetupScreen(
    setup: InspectionSetup,
    onSetupChange: (InspectionSetup) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    val valid = setup.customer.name.isNotBlank() &&
        setup.customer.address.isNotBlank() &&
        setup.inspector.name.isNotBlank()

    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "현장·담당자 입력", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            Text(
                text = "직원이 현장을 등록하고\n고객 전달용 리포트를 발행합니다.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "고객정보는 리포트 표지와 향후 견적 연동에 사용됩니다.",
                modifier = Modifier.padding(top = 8.dp, bottom = 18.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )

            SectionCard {
                Text("고객·현장정보", fontWeight = FontWeight.ExtraBold)
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = setup.customer.name,
                    onValueChange = {
                        onSetupChange(setup.copy(customer = setup.customer.copy(name = it)))
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("고객명") },
                    singleLine = true,
                )
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = setup.customer.phone,
                    onValueChange = { value ->
                        onSetupChange(
                            setup.copy(
                                customer = setup.customer.copy(
                                    phone = value.filter(Char::isDigit).take(11),
                                ),
                            ),
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("연락처") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                )
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = setup.customer.address,
                    onValueChange = {
                        onSetupChange(setup.copy(customer = setup.customer.copy(address = it)))
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("현장 주소·아파트명") },
                    minLines = 2,
                )
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = setup.customer.detailAddress,
                    onValueChange = {
                        onSetupChange(setup.copy(customer = setup.customer.copy(detailAddress = it)))
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("동·호수 또는 상세주소") },
                    singleLine = true,
                )
            }

            Spacer(modifier = Modifier.height(14.dp))
            SectionCard {
                Text("점검 담당직원", fontWeight = FontWeight.ExtraBold)
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = setup.inspector.name,
                    onValueChange = {
                        onSetupChange(setup.copy(inspector = setup.inspector.copy(name = it)))
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("직원명") },
                    singleLine = true,
                )
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = setup.inspector.teamPosition,
                    onValueChange = {
                        onSetupChange(setup.copy(inspector = setup.inspector.copy(teamPosition = it)))
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("팀·직급") },
                    placeholder = { Text("예: 창호팀 팀장") },
                    singleLine = true,
                )
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = setup.inspector.phone,
                    onValueChange = { value ->
                        onSetupChange(
                            setup.copy(
                                inspector = setup.inspector.copy(
                                    phone = value.filter(Char::isDigit).take(11),
                                ),
                            ),
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("직원 연락처") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                )
            }
            Spacer(modifier = Modifier.height(18.dp))
            PrimaryButton(text = "창호 위치 선택", onClick = onNext, enabled = valid)
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LocationSetupScreen(
    locations: List<WindowLocation>,
    onLocationsChange: (List<WindowLocation>) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    val presets = listOf(
        WindowLocation("living_room", "거실"),
        WindowLocation("master_room", "안방"),
        WindowLocation("room_1", "작은방 1"),
        WindowLocation("room_2", "작은방 2"),
        WindowLocation("kitchen", "주방"),
        WindowLocation("balcony", "발코니"),
        WindowLocation("utility", "다용도실"),
        WindowLocation("extended_room", "확장방"),
    )
    var customName by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "창호 위치 선택", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            Text(
                text = "점검할 창호를\n위치별로 모두 등록해 주세요.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "선택한 위치마다 표준 사진 5장과 결로·외부누수·기타 증상 사진을 별도로 등록합니다.",
                modifier = Modifier.padding(top = 8.dp, bottom = 18.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )

            SectionCard {
                Text("기본 위치", fontWeight = FontWeight.ExtraBold)
                FlowRow(
                    modifier = Modifier.padding(top = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    presets.forEach { preset ->
                        val selected = locations.any { it.id == preset.id }
                        FilterChip(
                            selected = selected,
                            onClick = {
                                onLocationsChange(
                                    if (selected) {
                                        locations.filterNot { it.id == preset.id }
                                    } else {
                                        locations + preset
                                    },
                                )
                            },
                            label = { Text(preset.name, fontWeight = FontWeight.SemiBold) },
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))
            SectionCard {
                Text("직접 위치 추가", fontWeight = FontWeight.ExtraBold)
                Text(
                    text = "같은 공간에 창이 여러 개면 ‘거실창 1’, ‘거실창 2’처럼 구분해 주세요.",
                    modifier = Modifier.padding(top = 5.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = EightyMuted,
                )
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = customName,
                        onValueChange = { customName = it.take(24) },
                        modifier = Modifier.weight(1f),
                        label = { Text("예: 거실 확장창") },
                        singleLine = true,
                    )
                    Button(
                        onClick = {
                            val name = customName.trim()
                            if (name.isNotBlank() && locations.none { it.name == name }) {
                                onLocationsChange(
                                    locations + WindowLocation(
                                        id = "custom_${System.currentTimeMillis()}",
                                        name = name,
                                    ),
                                )
                                customName = ""
                            }
                        },
                        enabled = customName.isNotBlank(),
                        modifier = Modifier.height(56.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text("추가", fontWeight = FontWeight.Bold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = "선택 위치 ${locations.size}개",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.ExtraBold,
            )
            locations.forEachIndexed { index, location ->
                SectionCard(modifier = Modifier.padding(top = 8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .background(EightySky, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("${index + 1}", color = EightyBlue, fontWeight = FontWeight.Black)
                        }
                        Text(
                            text = location.name,
                            modifier = Modifier.padding(start = 12.dp).weight(1f),
                            fontWeight = FontWeight.ExtraBold,
                        )
                        TextButton(onClick = { onLocationsChange(locations.filterNot { it.id == location.id }) }) {
                            Text("삭제", color = EightyDanger)
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(18.dp))
            PrimaryButton(
                text = "${locations.size}개 위치 촬영 시작",
                onClick = onNext,
                enabled = locations.isNotEmpty(),
            )
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@Composable
fun EvidencePhotosScreen(
    location: WindowLocation,
    selectedPhotos: Map<EvidenceType, Uri>,
    onCamera: (EvidenceType) -> Unit,
    onGallery: (EvidenceType) -> Unit,
    onRemove: (EvidenceType) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
    nextLabel: String,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "${location.name} 증상 사진", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            Text(
                text = "결로·외부누수·기타 이상을\n필요한 항목만 추가해 주세요.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "증상 사진은 선택사항이지만 원인 구분과 고객 설명에 큰 도움이 됩니다.",
                modifier = Modifier.padding(top = 8.dp, bottom = 18.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )

            EvidenceType.entries.forEach { type ->
                val uri = selectedPhotos[type]
                SectionCard(modifier = Modifier.padding(bottom = 12.dp)) {
                    Text(type.title, fontWeight = FontWeight.ExtraBold)
                    Text(
                        text = type.instruction,
                        modifier = Modifier.padding(top = 4.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = EightyMuted,
                    )
                    if (uri != null) {
                        Spacer(modifier = Modifier.height(10.dp))
                        ContentUriImage(
                            uri = uri,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(150.dp)
                                .background(Color(0xFFF2F6FC), RoundedCornerShape(14.dp)),
                        )
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedButton(
                            onClick = { onCamera(type) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text(if (uri == null) "촬영" else "다시 촬영", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(
                            onClick = { onGallery(type) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text("사진 업로드", fontWeight = FontWeight.Bold)
                        }
                    }
                    if (uri != null) {
                        TextButton(
                            onClick = { onRemove(type) },
                            modifier = Modifier.align(Alignment.End),
                        ) {
                            Text("사진 삭제", color = EightyDanger)
                        }
                    }
                }
            }

            PrimaryButton(text = nextLabel, onClick = onNext)
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LocationSymptomsScreen(
    location: WindowLocation,
    condition: LocationCondition,
    onConditionChange: (LocationCondition) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
    nextLabel: String,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "${location.name} 증상 확인", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            Text(
                text = "사진으로 확인하기 어려운\n사용 증상을 직원이 입력합니다.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "결로와 외부 누수는 발생 위치와 날씨 조건을 구분해 기록해 주세요.",
                modifier = Modifier.padding(top = 8.dp, bottom = 18.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )

            ChoiceBlock(
                title = "창호 사용 연수",
                options = listOf("5년 미만", "5~10년", "10~20년", "20년 이상", "모름"),
                selected = condition.yearsInUse,
                onSelected = { onConditionChange(condition.copy(yearsInUse = it)) },
            )
            ChoiceBlock(
                title = "외풍 체감",
                options = listOf("없음", "보통", "심함"),
                selected = condition.draftLevel,
                onSelected = { onConditionChange(condition.copy(draftLevel = it)) },
            )
            ChoiceBlock(
                title = "결로 발생",
                options = listOf("없음", "가끔", "자주", "복층유리 내부 의심"),
                selected = condition.condensation,
                onSelected = {
                    onConditionChange(
                        condition.copy(
                            condensation = it,
                            condensationArea = if (it == "없음") "해당 없음" else condition.condensationArea,
                        ),
                    )
                },
            )
            if (condition.condensation != "없음") {
                ChoiceBlock(
                    title = "결로 위치",
                    options = listOf("유리면", "창틀", "창 주변 벽체", "복합"),
                    selected = condition.condensationArea,
                    onSelected = { onConditionChange(condition.copy(condensationArea = it)) },
                )
            }
            ChoiceBlock(
                title = "외부 누수",
                options = listOf("없음", "의심", "비 올 때 발생", "강풍 동반 시 발생"),
                selected = condition.exteriorLeak,
                onSelected = {
                    onConditionChange(
                        condition.copy(
                            exteriorLeak = it,
                            leakArea = if (it == "없음") "해당 없음" else condition.leakArea,
                        ),
                    )
                },
            )
            if (condition.exteriorLeak != "없음") {
                ChoiceBlock(
                    title = "누수 위치",
                    options = listOf("상부", "측면", "하부 레일", "창 주변 벽체", "모름"),
                    selected = condition.leakArea,
                    onSelected = { onConditionChange(condition.copy(leakArea = it)) },
                )
            }
            ChoiceBlock(
                title = "개폐·잠금 상태",
                options = listOf("정상", "보통", "뻑뻑함", "잠금 불량"),
                selected = condition.openingCondition,
                onSelected = { onConditionChange(condition.copy(openingCondition = it)) },
            )
            ChoiceBlock(
                title = "외부 소음 체감",
                options = listOf("적음", "보통", "심함"),
                selected = condition.noiseLevel,
                onSelected = { onConditionChange(condition.copy(noiseLevel = it)) },
            )
            ChoiceBlock(
                title = "곰팡이·부식",
                options = listOf("없음", "조금", "심함"),
                selected = condition.moldCondition,
                onSelected = { onConditionChange(condition.copy(moldCondition = it)) },
            )
            SectionCard(modifier = Modifier.padding(bottom = 12.dp)) {
                Text("기타 확인사항", fontWeight = FontWeight.ExtraBold)
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = condition.otherIssue,
                    onValueChange = { onConditionChange(condition.copy(otherIssue = it.take(500))) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("예: 창을 닫을 때 상부가 걸리고 비가 많이 오면 우측 벽체가 젖음") },
                    minLines = 4,
                )
            }
            PrimaryButton(text = nextLabel, onClick = onNext)
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChoiceBlock(
    title: String,
    options: List<String>,
    selected: String,
    onSelected: (String) -> Unit,
) {
    SectionCard(modifier = Modifier.padding(bottom = 12.dp)) {
        Text(title, fontWeight = FontWeight.ExtraBold)
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
    setup: InspectionSetup,
    result: DiagnosisResult,
    review: StaffReview,
    onReviewChange: (StaffReview) -> Unit,
    onBack: () -> Unit,
    onPublish: () -> Unit,
) {
    val recommendations = listOf(
        "관리·청소",
        "창짝·부품 조정",
        "부분 보수 점검",
        "유리·부품 교체 검토",
        "전체 창호 교체 견적",
        "원인 확인 불가·재점검",
    )

    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "직원 검토·발행", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            Text(
                text = "AI 결과를 그대로 보내지 않고\n담당직원이 최종 확인합니다.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "고객에게 보일 문구와 내부 메모를 분리해 작성해 주세요.",
                modifier = Modifier.padding(top = 8.dp, bottom = 18.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )

            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    GradeBadge(grade = result.grade)
                    Column(modifier = Modifier.padding(start = 14.dp).weight(1f)) {
                        Text(result.gradeTitle, fontWeight = FontWeight.Black, color = EightyDanger)
                        Text(
                            text = "${setup.customer.name} · ${result.locations.size}개 위치 · 담당 ${setup.inspector.name}",
                            modifier = Modifier.padding(top = 5.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyMuted,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))
            Text("위치별 결과", fontWeight = FontWeight.ExtraBold)
            result.locations.forEach { location ->
                SectionCard(modifier = Modifier.padding(top = 8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = location.locationName,
                            modifier = Modifier.weight(1f),
                            fontWeight = FontWeight.ExtraBold,
                        )
                        Text(
                            text = "${location.grade} · ${location.gradeTitle}",
                            color = if (location.grade in listOf("D", "E")) EightyDanger else EightyBlue,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Text(
                        text = location.summary,
                        modifier = Modifier.padding(top = 8.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = EightyMuted,
                    )
                    location.findings.filter { it.level != com.eighty.windowcheck.model.FindingLevel.GOOD }
                        .take(3)
                        .forEach { finding ->
                            Row(
                                modifier = Modifier.padding(top = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                FindingStatus(level = finding.level)
                                Text(
                                    text = finding.title,
                                    modifier = Modifier.padding(start = 10.dp),
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))
            SectionCard {
                Text("최종 권장조치", fontWeight = FontWeight.ExtraBold)
                FlowRow(
                    modifier = Modifier.padding(top = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    recommendations.forEach { option ->
                        FilterChip(
                            selected = review.recommendation == option,
                            onClick = { onReviewChange(review.copy(recommendation = option)) },
                            label = { Text(option, fontWeight = FontWeight.SemiBold) },
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = review.customerComment,
                onValueChange = { onReviewChange(review.copy(customerComment = it.take(1000))) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("고객에게 전달할 직원 의견") },
                placeholder = { Text("예: 거실은 외부 코킹과 하부 배수 점검이 필요하고, 안방은 창짝 조정으로 개선 가능성이 있습니다.") },
                minLines = 5,
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = review.internalMemo,
                onValueChange = { onReviewChange(review.copy(internalMemo = it.take(1000))) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("사내 메모(고객 리포트 제외)") },
                placeholder = { Text("실측 필요 위치, 견적 요청사항, 담당자 인계내용") },
                minLines = 4,
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF2F6FC), RoundedCornerShape(14.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = review.confirmed,
                    onCheckedChange = { onReviewChange(review.copy(confirmed = it)) },
                )
                Text(
                    text = "담당직원이 사진, 위치별 증상, 진단 문구를 확인했습니다.",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = EightyNavy,
                )
            }
            Spacer(modifier = Modifier.height(18.dp))
            PrimaryButton(
                text = "고객용 리포트 발행 준비",
                onClick = onPublish,
                enabled = review.confirmed,
            )
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@Composable
fun CustomerReportScreen(
    setup: InspectionSetup,
    locations: List<WindowLocation>,
    result: DiagnosisResult,
    review: StaffReview,
    generatedReport: GeneratedInspectionReport?,
    quoteAttachment: QuoteAttachment?,
    isGenerating: Boolean,
    onBack: () -> Unit,
    onGenerateReport: () -> Unit,
    onPickQuote: () -> Unit,
    onRemoveQuote: () -> Unit,
    onShare: () -> Unit,
    onSolution: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "고객 리포트 발행", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            Text(
                text = "점검 리포트를 PDF로 만들고\n견적서와 함께 고객에게 발송합니다.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "카카오톡, 문자, 이메일 등 휴대전화의 공유 앱을 선택할 수 있습니다.",
                modifier = Modifier.padding(top = 8.dp, bottom = 18.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )

            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    GradeBadge(grade = result.grade)
                    Column(modifier = Modifier.padding(start = 14.dp).weight(1f)) {
                        Text(setup.customer.name, fontWeight = FontWeight.Black, color = EightyNavy)
                        Text(
                            text = listOf(setup.customer.address, setup.customer.detailAddress)
                                .filter { it.isNotBlank() }
                                .joinToString(" "),
                            modifier = Modifier.padding(top = 4.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyMuted,
                        )
                        Text(
                            text = "${locations.size}개 위치 · ${review.recommendation}",
                            modifier = Modifier.padding(top = 4.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyBlue,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))
            SectionCard {
                Text("PDF 리포트 구성", fontWeight = FontWeight.ExtraBold)
                val items = listOf(
                    "고객·현장·담당직원 정보",
                    "위치별 종합등급 및 항목별 점검",
                    "결로·외부누수·외풍·개폐 등 직원 입력 증상",
                    "위치별 표준사진과 추가 증상사진",
                    "담당직원 최종 권장조치와 고객 전달 의견",
                )
                items.forEach { item ->
                    Row(modifier = Modifier.padding(top = 9.dp)) {
                        Text("✓", color = EightyBlue, fontWeight = FontWeight.Black)
                        Text(
                            text = item,
                            modifier = Modifier.padding(start = 8.dp).weight(1f),
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyMuted,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))
            if (generatedReport == null) {
                PrimaryButton(
                    text = if (isGenerating) "PDF 생성 중..." else "점검 리포트 PDF 생성",
                    onClick = onGenerateReport,
                    enabled = !isGenerating,
                )
            } else {
                SectionCard {
                    Text("리포트 생성 완료", color = EightyBlue, fontWeight = FontWeight.ExtraBold)
                    Text(
                        text = generatedReport.fileName,
                        modifier = Modifier.padding(top = 6.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = EightyMuted,
                    )
                    Text(
                        text = "리포트 번호 ${generatedReport.reportNumber}",
                        modifier = Modifier.padding(top = 4.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = EightyNavy,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Spacer(modifier = Modifier.height(10.dp))
                SecondaryButton(text = "PDF 다시 생성", onClick = onGenerateReport, enabled = !isGenerating)
            }

            Spacer(modifier = Modifier.height(14.dp))
            SectionCard {
                Text("견적서 첨부(선택)", fontWeight = FontWeight.ExtraBold)
                Text(
                    text = "현재는 PDF 견적서를 선택해 리포트와 함께 보냅니다. ERP 견적 자동연결은 다음 단계에서 추가합니다.",
                    modifier = Modifier.padding(top = 5.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = EightyMuted,
                )
                Spacer(modifier = Modifier.height(10.dp))
                if (quoteAttachment == null) {
                    OutlinedButton(
                        onClick = onPickQuote,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text("견적서 PDF 선택", fontWeight = FontWeight.Bold)
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = quoteAttachment.displayName,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyNavy,
                            fontWeight = FontWeight.SemiBold,
                        )
                        TextButton(onClick = onRemoveQuote) {
                            Text("제외", color = EightyDanger)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))
            PrimaryButton(
                text = if (quoteAttachment == null) "고객에게 리포트 발송" else "리포트 + 견적서 함께 발송",
                onClick = onShare,
                enabled = generatedReport != null,
            )
            Spacer(modifier = Modifier.height(10.dp))
            SecondaryButton(text = "추천 솔루션 확인", onClick = onSolution)
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = "고객 발송 전 개인정보, 주소, 직원 의견과 견적금액을 한 번 더 확인하세요.",
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodySmall,
                color = EightyMuted,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}
