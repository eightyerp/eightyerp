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
import androidx.compose.material3.OutlinedButton
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
    locationCount: Int,
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
                text = "등록한 ${locationCount}개 위치를\n각각 같은 기준으로 촬영합니다.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "현장에서 바로 촬영하거나 휴대전화 앨범의 기존 사진을 업로드할 수 있습니다.",
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
                    text = "같은 공간에 창호가 여러 개면 위치 등록 단계에서 ‘거실창 1’, ‘거실창 2’처럼 각각 등록해야 리포트가 구분됩니다.",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = EightyMuted,
                )
            }
        }
        Box(modifier = Modifier.padding(20.dp)) {
            PrimaryButton(text = "${locationCount}개 위치 촬영 시작", onClick = onStartCapture)
        }
    }
}

@Composable
fun CaptureScreen(
    locationName: String,
    currentLocationIndex: Int,
    totalLocations: Int,
    currentIndex: Int,
    capturedCount: Int,
    latestPhotoUri: Uri?,
    onBack: () -> Unit,
    onCapture: () -> Unit,
    onGallery: () -> Unit,
    onNext: () -> Unit,
    nextLabel: String,
) {
    val currentType = CaptureType.entries[currentIndex.coerceIn(0, CaptureType.entries.lastIndex)]
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(
            title = "위치 ${currentLocationIndex + 1}/$totalLocations · 사진 ${currentIndex + 1}/${CaptureType.entries.size}",
            onBack = onBack,
        )
        Column(
            modifier = Modifier
                .weight(1f)
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
                text = currentType.instruction,
                modifier = Modifier.padding(top = 8.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(18.dp))
            ContentUriImage(
                uri = latestPhotoUri,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .border(2.dp, Color(0xFFD8E5FA), RoundedCornerShape(26.dp))
                    .background(Color(0xFFF1F5FB), RoundedCornerShape(26.dp)),
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = if (latestPhotoUri == null) {
                    "$locationName 사진 $capturedCount/${CaptureType.entries.size} · 촬영 또는 업로드해 주세요."
                } else {
                    "$locationName 사진 $capturedCount/${CaptureType.entries.size} · 선명도와 촬영 부위를 확인해 주세요."
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
            if (latestPhotoUri != null) {
                Spacer(modifier = Modifier.height(10.dp))
                PrimaryButton(text = nextLabel, onClick = onNext)
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
        CircularProgress(progress = progress, label = "위치별 사진 분석")
        Spacer(modifier = Modifier.height(28.dp))
        Text(
            text = "위치별 표준사진과 추가 증상사진을\n구분해 정리하고 있습니다.",
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
            "사진 누락·중복 확인" to 0.18f,
            "위치별 창틀·유리 영역 확인" to 0.38f,
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
