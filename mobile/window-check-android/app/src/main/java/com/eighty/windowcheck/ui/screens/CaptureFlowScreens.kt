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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.eighty.windowcheck.model.CaptureType
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
                text = "창호 사진을\n아래 순서대로 촬영해 주세요.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "정확한 진단을 위해 밝고 선명한 사진 5장이 필요합니다.",
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )
            Spacer(modifier = Modifier.height(20.dp))

            CaptureType.entries.forEachIndexed { index, type ->
                SectionCard(modifier = Modifier.padding(bottom = 10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .background(Color(0xFFEAF2FF), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "${index + 1}",
                                color = EightyBlue,
                                fontWeight = FontWeight.Black,
                            )
                        }
                        Column(modifier = Modifier.padding(start = 12.dp).weight(1f)) {
                            Text(
                                text = type.title,
                                fontWeight = FontWeight.ExtraBold,
                                style = MaterialTheme.typography.titleSmall,
                            )
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
                    .background(Color(0xFFFFF7E8), RoundedCornerShape(14.dp))
                    .padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(text = "⚠️")
                Text(
                    text = "외부 사진은 안전하게 촬영 가능한 경우에만 선택하세요. 몸을 창밖으로 내밀지 마세요.",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF855B0D),
                )
            }
        }
        Box(modifier = Modifier.padding(20.dp)) {
            PrimaryButton(text = "촬영 시작하기", onClick = onStartCapture)
        }
    }
}

@Composable
fun CaptureScreen(
    currentIndex: Int,
    capturedCount: Int,
    latestPhotoUri: Uri?,
    onBack: () -> Unit,
    onCapture: () -> Unit,
    onRetake: () -> Unit,
    onNext: () -> Unit,
) {
    val currentType = CaptureType.entries[currentIndex.coerceIn(0, CaptureType.entries.lastIndex)]
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(
            title = "${currentIndex + 1} / ${CaptureType.entries.size}",
            onBack = onBack,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 20.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            StepDots(
                current = currentIndex,
                total = CaptureType.entries.size,
                modifier = Modifier.padding(bottom = 20.dp),
            )
            Text(
                text = currentType.title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = currentType.instruction,
                modifier = Modifier.padding(top = 8.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(22.dp))
            ContentUriImage(
                uri = latestPhotoUri,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .border(2.dp, Color(0xFFD8E5FA), RoundedCornerShape(26.dp))
                    .background(Color(0xFFF1F5FB), RoundedCornerShape(26.dp)),
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = if (latestPhotoUri == null) {
                    "사진을 찍은 뒤 선명도와 촬영 부위를 확인해 주세요."
                } else {
                    "촬영 완료 · 선명하지 않으면 다시 촬영하세요."
                },
                style = MaterialTheme.typography.bodySmall,
                color = EightyMuted,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(14.dp))

            if (latestPhotoUri == null) {
                PrimaryButton(text = "카메라 열기", onClick = onCapture)
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    androidx.compose.material3.OutlinedButton(
                        onClick = onRetake,
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text("다시 촬영", fontWeight = FontWeight.Bold)
                    }
                    androidx.compose.material3.Button(
                        onClick = onNext,
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text(
                            text = if (capturedCount >= CaptureType.entries.size) "분석 시작" else "다음",
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                }
            }
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
        CircularProgress(progress = progress, label = "사진 분석")
        Spacer(modifier = Modifier.height(28.dp))
        Text(
            text = "AI가 사진에서 관찰되는 상태를 정리하고 있습니다.",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            color = EightyNavy,
        )
        Text(
            text = "결과는 전문가 확인 전 예비진단입니다.",
            modifier = Modifier.padding(top = 8.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = EightyMuted,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(28.dp))

        val checks = listOf(
            "이미지 품질 확인" to 0.18f,
            "창틀·유리 영역 확인" to 0.38f,
            "손상 및 오염 흔적 분석" to 0.62f,
            "결과 종합 분석" to 0.82f,
            "진단 리포트 생성" to 0.96f,
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
            text = "사진은 내부 테스트용으로만 사용되며, 서버 연동 전까지 기기 임시 저장소에 보관됩니다.",
            style = MaterialTheme.typography.bodySmall,
            color = EightyMuted,
            textAlign = TextAlign.Center,
        )
    }
}
