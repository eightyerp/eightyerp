package com.eighty.windowcheck.ui.screens

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.eighty.windowcheck.model.CaptureSkipReason
import com.eighty.windowcheck.model.CaptureType
import com.eighty.windowcheck.model.InspectionMode
import com.eighty.windowcheck.model.PhotoCaptureDecision
import com.eighty.windowcheck.ui.components.AppHeader
import com.eighty.windowcheck.ui.components.CircularProgress
import com.eighty.windowcheck.ui.components.PrimaryButton
import com.eighty.windowcheck.ui.components.SectionCard
import com.eighty.windowcheck.ui.components.StepDots
import com.eighty.windowcheck.ui.theme.EightyBlue
import com.eighty.windowcheck.ui.theme.EightyMuted
import com.eighty.windowcheck.ui.theme.EightyNavy
import com.eighty.windowcheck.ui.theme.EightySuccess
import com.eighty.windowcheck.util.ContentUriImage

@Composable
fun CaptureGuideScreen(
    locationCount: Int,
    inspectionMode: InspectionMode,
    onModeChange: (InspectionMode) -> Unit,
    onBack: () -> Unit,
    onStartCapture: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "촬영 안내", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
        ) {
            Text(
                text = "전체 사진 1장부터 빠르게\n점검을 시작합니다.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "창틀 모서리·유리·하부·손잡이는 필요할 때만 촬영하고, 전체사진으로 확인되면 사유를 남기고 건너뛸 수 있습니다.",
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )
            Spacer(modifier = Modifier.height(18.dp))

            Text(
                text = "점검 방식",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.ExtraBold,
                color = EightyNavy,
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                InspectionMode.entries.forEach { mode ->
                    FilterChip(
                        selected = inspectionMode == mode,
                        onClick = { onModeChange(mode) },
                        label = { Text(mode.label, fontWeight = FontWeight.Bold) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            Text(
                text = inspectionMode.description,
                modifier = Modifier.padding(top = 8.dp, bottom = 14.dp),
                style = MaterialTheme.typography.bodySmall,
                color = EightyMuted,
            )

            CaptureType.entries.forEachIndexed { index, type ->
                val required = type == CaptureType.WHOLE_WINDOW
                SectionCard(modifier = Modifier.padding(bottom = 10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .background(
                                    if (required) Color(0xFFEAF2FF) else Color(0xFFF2F4F8),
                                    CircleShape,
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "${index + 1}",
                                color = if (required) EightyBlue else EightyMuted,
                                fontWeight = FontWeight.Black,
                            )
                        }
                        Column(modifier = Modifier.padding(start = 12.dp).weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = type.title,
                                    fontWeight = FontWeight.ExtraBold,
                                    style = MaterialTheme.typography.titleSmall,
                                )
                                Text(
                                    text = if (required) "  필수" else "  선택",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (required) EightyBlue else EightyMuted,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                            Text(
                                text = type.instruction,
                                style = MaterialTheme.typography.bodySmall,
                                color = EightyMuted,
                                modifier = Modifier.padding(top = 3.dp),
                            )
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFEFF7F2), RoundedCornerShape(14.dp))
                    .padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(text = "✓")
                Text(
                    text = "간편 점검은 개별 창호당 전체 사진 1장만으로도 진행할 수 있습니다. 세부사진이 없으면 리포트에 생략 사유가 표시됩니다.",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF246746),
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFFFF7E8), RoundedCornerShape(14.dp))
                    .padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(text = "⚠️")
                Text(
                    text = "외부 사진은 안전한 위치에서만 촬영하세요. 몸을 창밖으로 내밀거나 난간에 기대지 마세요.",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF855B0D),
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF2F6FC), RoundedCornerShape(14.dp))
                    .padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(text = "📍")
                Text(
                    text = "같은 공간에 창호가 여러 개면 ‘거실창 1’, ‘거실창 2’처럼 각각 등록해야 결과와 리포트가 구분됩니다.",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = EightyMuted,
                )
            }
        }
        Box(modifier = Modifier.padding(20.dp)) {
            PrimaryButton(text = "${locationCount}개 창호 점검 시작", onClick = onStartCapture)
        }
    }
}

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
    onNext: () -> Unit,
    nextLabel: String,
) {
    val currentType = CaptureType.entries[currentIndex.coerceIn(0, CaptureType.entries.lastIndex)]
    val isRequired = currentType == CaptureType.WHOLE_WINDOW
    val canContinue = latestPhotoUri != null || decision != null

    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(
            title = "창호 ${currentLocationIndex + 1}/$totalLocations · 항목 ${currentIndex + 1}/${CaptureType.entries.size}",
            onBack = onBack,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = locationName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.ExtraBold,
                color = EightyBlue,
            )
            StepDots(
                current = currentIndex,
                total = CaptureType.entries.size,
                modifier = Modifier.padding(top = 10.dp, bottom = 18.dp),
            )
            Text(
                text = currentType.title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = if (isRequired) "필수 사진" else "선택 사진 · 필요 없으면 건너뛸 수 있음",
                modifier = Modifier.padding(top = 4.dp),
                style = MaterialTheme.typography.labelMedium,
                color = if (isRequired) EightyBlue else EightyMuted,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = currentType.instruction,
                modifier = Modifier.padding(top = 8.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(16.dp))
            ContentUriImage(
                uri = latestPhotoUri,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(245.dp)
                    .border(2.dp, Color(0xFFD8E5FA), RoundedCornerShape(26.dp))
                    .background(Color(0xFFF1F5FB), RoundedCornerShape(26.dp)),
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = when {
                    latestPhotoUri != null -> "$locationName · 완료 $completedCount/${CaptureType.entries.size} · 사진을 확인해 주세요."
                    decision != null -> "$locationName · 완료 $completedCount/${CaptureType.entries.size} · ${decision.status.label}"
                    else -> "$locationName · 완료 $completedCount/${CaptureType.entries.size}"
                },
                style = MaterialTheme.typography.bodySmall,
                color = EightyMuted,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedButton(
                    onClick = onCapture,
                    modifier = Modifier.weight(1f).height(50.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text(
                        text = if (latestPhotoUri == null) "카메라 촬영" else "다시 촬영",
                        fontWeight = FontWeight.Bold,
                    )
                }
                OutlinedButton(
                    onClick = onGallery,
                    modifier = Modifier.weight(1f).height(50.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text(
                        text = if (latestPhotoUri == null) "사진 업로드" else "앨범에서 변경",
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            if (!isRequired && latestPhotoUri == null && decision == null) {
                Spacer(modifier = Modifier.height(16.dp))
                SectionCard {
                    Text(
                        text = if (inspectionMode == InspectionMode.SIMPLE) {
                            "전체 사진 1장으로 충분하다면 바로 패스하세요."
                        } else {
                            "세부사진이 필요하지 않다면 사유를 선택해 패스하세요."
                        },
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.ExtraBold,
                        color = EightyNavy,
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedButton(
                        onClick = { onSkip(CaptureSkipReason.COVERED_BY_WHOLE_PHOTO) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text("전체사진으로 확인 가능 · 패스", fontWeight = FontWeight.Bold)
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedButton(
                            onClick = { onSkip(CaptureSkipReason.NO_VISIBLE_ISSUE) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text("이상 없음", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(
                            onClick = { onSkip(CaptureSkipReason.NOT_NEEDED_ON_SITE) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text("현장상 불필요", fontWeight = FontWeight.Bold)
                        }
                    }
                    TextButton(
                        onClick = onDefer,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("나중에 촬영", fontWeight = FontWeight.Bold)
                    }
                }
            }

            if (decision != null && latestPhotoUri == null) {
                Spacer(modifier = Modifier.height(14.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFF1F7FF), RoundedCornerShape(14.dp))
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = decision.status.label,
                            fontWeight = FontWeight.ExtraBold,
                            color = EightyNavy,
                        )
                        Text(
                            text = decision.reason.label,
                            modifier = Modifier.padding(top = 3.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyMuted,
                        )
                    }
                    TextButton(onClick = onClearDecision) {
                        Text("선택 취소")
                    }
                }
            }

            if (canContinue) {
                Spacer(modifier = Modifier.height(12.dp))
                PrimaryButton(text = nextLabel, onClick = onNext)
            } else if (isRequired) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "창호 전체 사진 1장은 반드시 촬영하거나 업로드해야 합니다.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFFB23A48),
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@Composable
fun AnalysisScreen(
    progress: Float,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "AI 분석 중",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.ExtraBold,
        )
        Spacer(modifier = Modifier.weight(1f))
        CircularProgress(progress = progress, label = "위치별 사진 분석")
        Spacer(modifier = Modifier.height(28.dp))
        Text(
            text = "등록 사진과 촬영 생략 사유를\n위치별로 구분해 정리하고 있습니다.",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            color = EightyNavy,
        )
        Text(
            text = "결과는 담당직원 확인 전 예비진단입니다.",
            modifier = Modifier.padding(top = 8.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = EightyMuted,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(28.dp))

        val checks = listOf(
            "필수 전체사진 확인" to 0.18f,
            "선택사진·생략 사유 확인" to 0.38f,
            "결로·외부누수·기타 증상 정리" to 0.62f,
            "위치별 점검 결과 종합" to 0.82f,
            "직원 검토용 리포트 생성" to 0.96f,
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White, RoundedCornerShape(20.dp))
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            checks.forEach { (label, threshold) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(22.dp)
                            .background(
                                if (progress >= threshold) EightySuccess else Color(0xFFE7ECF5),
                                CircleShape,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = if (progress >= threshold) "✓" else "·",
                            color = if (progress >= threshold) Color.White else EightyMuted,
                            fontWeight = FontWeight.Black,
                        )
                    }
                    Text(
                        text = label,
                        modifier = Modifier.padding(start = 12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = if (progress >= threshold) EightyNavy else EightyMuted,
                    )
                }
            }
        }
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "현재 내부 MVP의 AI 결과는 화면·업무흐름 검증용 예시입니다. 실제 고객 발송 전 직원 검토가 필수입니다.",
            style = MaterialTheme.typography.bodySmall,
            color = EightyMuted,
            textAlign = TextAlign.Center,
        )
    }
}
