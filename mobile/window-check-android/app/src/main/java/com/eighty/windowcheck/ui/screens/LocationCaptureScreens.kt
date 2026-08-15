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
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
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
import com.eighty.windowcheck.model.EvidenceType
import com.eighty.windowcheck.model.WindowLocation
import com.eighty.windowcheck.ui.components.AppHeader
import com.eighty.windowcheck.ui.components.PrimaryButton
import com.eighty.windowcheck.ui.components.SectionCard
import com.eighty.windowcheck.ui.theme.EightyBlue
import com.eighty.windowcheck.ui.theme.EightyMuted
import com.eighty.windowcheck.ui.theme.EightyNavy
import com.eighty.windowcheck.util.ContentUriImage

@Composable
fun LocationCaptureGuideScreen(
    locations: List<WindowLocation>,
    onBack: () -> Unit,
    onStartCapture: () -> Unit,
) {
    val requiredCount = locations.size * CaptureType.entries.size
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "위치별 촬영 안내", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 10.dp),
        ) {
            Text(
                text = "선택한 ${locations.size}개 위치를\n하나씩 점검합니다.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "위치마다 기본 사진 5장을 촬영하고, 결로·외부 누수·기타 이상 사진은 필요한 항목만 추가합니다.",
                modifier = Modifier.padding(top = 8.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )
            Spacer(modifier = Modifier.height(18.dp))

            SectionCard {
                Text(
                    text = "촬영 대상 위치",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                )
                locations.forEachIndexed { index, location ->
                    Row(
                        modifier = Modifier.padding(top = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .background(Color(0xFFEAF2FF), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "${index + 1}",
                                color = EightyBlue,
                                fontWeight = FontWeight.Black,
                            )
                        }
                        Column(modifier = Modifier.padding(start = 10.dp)) {
                            Text(location.name, fontWeight = FontWeight.Bold)
                            if (location.note.isNotBlank()) {
                                Text(
                                    text = location.note,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = EightyMuted,
                                )
                            }
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))

            SectionCard {
                Text(
                    text = "기본 촬영 · 총 ${requiredCount}장",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                )
                CaptureType.entries.forEachIndexed { index, type ->
                    Row(
                        modifier = Modifier.padding(top = 10.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Text(
                            text = "${index + 1}.",
                            color = EightyBlue,
                            fontWeight = FontWeight.Black,
                        )
                        Column(modifier = Modifier.padding(start = 8.dp)) {
                            Text(type.title, fontWeight = FontWeight.Bold)
                            Text(
                                text = type.instruction,
                                style = MaterialTheme.typography.bodySmall,
                                color = EightyMuted,
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))

            SectionCard {
                Text(
                    text = "증상 사진 · 위치별 선택",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                )
                EvidenceType.entries.forEach { type ->
                    Row(
                        modifier = Modifier.padding(top = 10.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Text(text = "•", color = EightyBlue, fontWeight = FontWeight.Black)
                        Column(modifier = Modifier.padding(start = 8.dp)) {
                            Text(type.title, fontWeight = FontWeight.Bold)
                            Text(
                                text = type.instruction,
                                style = MaterialTheme.typography.bodySmall,
                                color = EightyMuted,
                            )
                        }
                    }
                }
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
                    text = "외부 누수 사진은 반드시 실내의 안전한 위치에서만 촬영하세요. 몸이나 휴대전화를 창밖으로 내밀지 마세요.",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF855B0D),
                )
            }
        }
        Box(modifier = Modifier.padding(20.dp)) {
            PrimaryButton(text = "위치별 촬영 시작", onClick = onStartCapture)
        }
    }
}

@Composable
fun LocationCaptureScreen(
    location: WindowLocation,
    type: CaptureType,
    currentIndex: Int,
    totalCount: Int,
    capturedCount: Int,
    photoUri: Uri?,
    onBack: () -> Unit,
    onCamera: () -> Unit,
    onGallery: () -> Unit,
    onNext: () -> Unit,
) {
    val progress = if (totalCount <= 0) 0f else (currentIndex + 1f) / totalCount.toFloat()
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "기본 촬영 ${currentIndex + 1} / $totalCount", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 20.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            LinearProgressIndicator(
                progress = { progress.coerceIn(0f, 1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(7.dp),
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 14.dp)
                    .background(Color(0xFFEAF2FF), RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "촬영 위치",
                    style = MaterialTheme.typography.labelMedium,
                    color = EightyMuted,
                )
                Text(
                    text = location.name,
                    modifier = Modifier.padding(start = 10.dp),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Black,
                    color = EightyNavy,
                )
            }
            Spacer(modifier = Modifier.height(18.dp))
            Text(
                text = type.title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = type.instruction,
                modifier = Modifier.padding(top = 8.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(18.dp))
            ContentUriImage(
                uri = photoUri,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .border(2.dp, Color(0xFFD8E5FA), RoundedCornerShape(24.dp))
                    .background(Color(0xFFF1F5FB), RoundedCornerShape(24.dp)),
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "완료 $capturedCount / $totalCount · 카메라 촬영 또는 기존 사진 업로드 가능",
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
                    onClick = onGallery,
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text(
                        text = if (photoUri == null) "사진 업로드" else "사진 교체",
                        fontWeight = FontWeight.Bold,
                    )
                }
                Button(
                    onClick = onCamera,
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text(
                        text = if (photoUri == null) "카메라 촬영" else "다시 촬영",
                        fontWeight = FontWeight.ExtraBold,
                    )
                }
            }
            if (photoUri != null) {
                Spacer(modifier = Modifier.height(10.dp))
                PrimaryButton(
                    text = if (currentIndex >= totalCount - 1) "증상 사진으로 이동" else "다음 사진",
                    onClick = onNext,
                )
            }
        }
    }
}

@Composable
fun EvidenceCaptureScreen(
    location: WindowLocation,
    type: EvidenceType,
    currentIndex: Int,
    totalCount: Int,
    registeredCount: Int,
    photoUri: Uri?,
    onBack: () -> Unit,
    onCamera: () -> Unit,
    onGallery: () -> Unit,
    onSkip: () -> Unit,
    onNext: () -> Unit,
) {
    val progress = if (totalCount <= 0) 0f else (currentIndex + 1f) / totalCount.toFloat()
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "증상 촬영 ${currentIndex + 1} / $totalCount", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 20.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            LinearProgressIndicator(
                progress = { progress.coerceIn(0f, 1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(7.dp),
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 14.dp)
                    .background(Color(0xFFFFF4E6), RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "증상 위치",
                    style = MaterialTheme.typography.labelMedium,
                    color = EightyMuted,
                )
                Text(
                    text = location.name,
                    modifier = Modifier.padding(start = 10.dp),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Black,
                    color = EightyNavy,
                )
            }
            Spacer(modifier = Modifier.height(18.dp))
            Text(
                text = type.title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = type.instruction,
                modifier = Modifier.padding(top = 8.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
                textAlign = TextAlign.Center,
            )
            if (type == EvidenceType.EXTERIOR_LEAK) {
                Text(
                    text = "안전하게 촬영할 수 없으면 건너뛰고 현장 메모에 남겨주세요.",
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp)
                        .background(Color(0xFFFFF7E8), RoundedCornerShape(12.dp))
                        .padding(12.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF855B0D),
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
            ContentUriImage(
                uri = photoUri,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .border(2.dp, Color(0xFFF1D5AF), RoundedCornerShape(24.dp))
                    .background(Color(0xFFFFFAF4), RoundedCornerShape(24.dp)),
                emptyText = "증상이 있을 때만 촬영하거나 업로드하세요.",
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "증상 사진 등록 $registeredCount장 · 해당 증상이 없으면 건너뛰기",
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
                    onClick = onGallery,
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text("사진 업로드", fontWeight = FontWeight.Bold)
                }
                Button(
                    onClick = onCamera,
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text("카메라 촬영", fontWeight = FontWeight.ExtraBold)
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
            if (photoUri == null) {
                OutlinedButton(
                    onClick = onSkip,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text(
                        text = if (currentIndex >= totalCount - 1) "증상 없음 · 문답으로 이동" else "해당 없음 · 건너뛰기",
                        fontWeight = FontWeight.Bold,
                    )
                }
            } else {
                PrimaryButton(
                    text = if (currentIndex >= totalCount - 1) "증상 문답으로 이동" else "다음 증상",
                    onClick = onNext,
                )
            }
        }
    }
}
