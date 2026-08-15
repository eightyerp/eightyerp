package com.eighty.windowcheck.ui.screens

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.eighty.windowcheck.model.EvidenceType
import com.eighty.windowcheck.model.WindowLocation
import com.eighty.windowcheck.ui.components.AppHeader
import com.eighty.windowcheck.ui.components.PrimaryButton
import com.eighty.windowcheck.ui.components.SectionCard
import com.eighty.windowcheck.ui.theme.EightyMuted
import com.eighty.windowcheck.ui.theme.EightyNavy
import com.eighty.windowcheck.util.ContentUriImage

@Composable
fun MultiEvidencePhotosScreen(
    location: WindowLocation,
    selectedPhotos: Map<EvidenceType, List<Uri>>,
    onCamera: (EvidenceType) -> Unit,
    onGallery: (EvidenceType) -> Unit,
    onRemove: (EvidenceType, Int) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
    nextLabel: String,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "${location.name} 상세 사진", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            Text(
                text = "결로·누수·코킹·파손 사진을\n항목별로 여러 장 등록할 수 있습니다.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "전체 위치사진, 증상 근접사진, 상부·측면·하부 순으로 등록하면 직원 검토와 고객 설명에 도움이 됩니다.",
                modifier = Modifier.padding(top = 8.dp, bottom = 12.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )
            Text(
                text = "외부 상태는 실내의 안전한 위치에서만 촬영하십시오. 몸이나 휴대전화를 창밖으로 내밀지 마십시오.",
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFFFF7E8), RoundedCornerShape(14.dp))
                    .padding(12.dp),
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF855B0D),
            )
            Spacer(modifier = Modifier.height(14.dp))

            EvidenceType.entries.forEach { type ->
                val photos = selectedPhotos[type].orEmpty()
                SectionCard(modifier = Modifier.padding(bottom = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(type.title, fontWeight = FontWeight.ExtraBold)
                            Text(
                                type.instruction,
                                modifier = Modifier.padding(top = 4.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = EightyMuted,
                            )
                        }
                        Text(
                            text = "${photos.size}장",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Black,
                        )
                    }

                    photos.forEachIndexed { index, uri ->
                        Spacer(modifier = Modifier.height(10.dp))
                        ContentUriImage(
                            uri = uri,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(130.dp)
                                .background(Color(0xFFF2F6FC), RoundedCornerShape(14.dp)),
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                        ) {
                            TextButton(onClick = { onRemove(type, index) }) {
                                Text("이 사진 삭제")
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedButton(
                            onClick = { onCamera(type) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text("사진 추가 촬영", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(
                            onClick = { onGallery(type) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text("앨범에서 추가", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            PrimaryButton(text = nextLabel, onClick = onNext)
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}
