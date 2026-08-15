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
import com.eighty.windowcheck.ui.theme.EightyMuted
import com.eighty.windowcheck.ui.theme.EightyNavy

@Composable
fun StartScreen(
    onStart: () -> Unit,
    onHistory: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BrandLockup(modifier = Modifier.fillMaxWidth())
        Spacer(modifier = Modifier.weight(1f))

        Box(
            modifier = Modifier
                .size(196.dp)
                .background(Color(0xFFEAF2FF), RoundedCornerShape(40.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(122.dp)
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
                    .padding(20.dp)
                    .size(68.dp)
                    .background(EightyBlue, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "AI",
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    style = MaterialTheme.typography.titleLarge,
                )
            }
        }

        Spacer(modifier = Modifier.height(34.dp))
        Text(
            text = "우리집 창호\nAI 예비진단",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Black,
            color = EightyNavy,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(14.dp))
        Text(
            text = "사진 5장과 간단한 증상 입력으로\n창호 상태를 빠르게 점검합니다.",
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
                text = "AI 결과는 예비진단이며, 최종 판단은 전문가 현장점검 후 확정합니다.",
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodySmall,
                color = EightyMuted,
            )
        }
        Spacer(modifier = Modifier.height(14.dp))
        PrimaryButton(text = "AI 진단 시작하기", onClick = onStart)
        Spacer(modifier = Modifier.height(10.dp))
        SecondaryButton(text = "진단 기록 보기", onClick = onHistory)
    }
}
