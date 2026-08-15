package com.eighty.windowcheck.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.eighty.windowcheck.ui.components.BrandLockup
import com.eighty.windowcheck.ui.components.PrimaryButton
import com.eighty.windowcheck.ui.components.SecondaryButton
import com.eighty.windowcheck.ui.theme.EightyBlue
import com.eighty.windowcheck.ui.theme.EightyDanger
import com.eighty.windowcheck.ui.theme.EightyMuted
import com.eighty.windowcheck.ui.theme.EightyNavy

@Composable
fun StartScreen(
    hasDraft: Boolean,
    onStart: () -> Unit,
    onResume: () -> Unit,
    onHistory: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BrandLockup(modifier = Modifier.fillMaxWidth())
        Spacer(modifier = Modifier.height(10.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFFFF0F0), RoundedCornerShape(14.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "개발 테스트 모드 · 실제 AI 분석 아님",
                color = EightyDanger,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(modifier = Modifier.weight(1f))

        Box(
            modifier = Modifier
                .size(188.dp)
                .background(Color(0xFFEAF2FF), RoundedCornerShape(40.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(118.dp)
                    .background(Color.White, RoundedCornerShape(24.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "창",
                    color = EightyBlue,
                    style = MaterialTheme.typography.displayMedium,
                    fontWeight = FontWeight.Black,
                )
            }
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(18.dp)
                    .size(68.dp)
                    .background(EightyBlue, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "CHECK",
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }

        Spacer(modifier = Modifier.height(28.dp))
        Text(
            text = "에잇티 직원용\n창호 현장점검",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Black,
            color = EightyNavy,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = "공간 안의 개별 창호를 따로 등록하고\n사진·증상·리포트·견적서를 한 번에 관리합니다.",
            style = MaterialTheme.typography.bodyLarge,
            color = EightyMuted,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.weight(1f))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFF2F6FC), RoundedCornerShape(16.dp))
                .padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = "ℹ️")
            Text(
                text = "현재 분석결과는 서버·업무흐름 검증용 Mock입니다. 고객 발송 전 담당직원이 모든 사진과 문구를 확인해야 합니다.",
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodySmall,
                color = EightyMuted,
            )
        }
        Spacer(modifier = Modifier.height(14.dp))
        if (hasDraft) {
            PrimaryButton(text = "작성 중 점검 이어하기", onClick = onResume)
            Spacer(modifier = Modifier.height(10.dp))
            SecondaryButton(text = "새 현장 점검 시작", onClick = onStart)
        } else {
            PrimaryButton(text = "새 현장 점검 시작", onClick = onStart)
        }
        Spacer(modifier = Modifier.height(10.dp))
        SecondaryButton(text = "점검 기록 보기", onClick = onHistory)
    }
}
