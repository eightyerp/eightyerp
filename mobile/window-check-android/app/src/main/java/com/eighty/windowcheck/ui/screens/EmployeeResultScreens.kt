package com.eighty.windowcheck.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.eighty.windowcheck.model.DiagnosisResult
import com.eighty.windowcheck.model.FindingLevel
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

@Composable
fun EmployeeResultSummaryScreen(
    result: DiagnosisResult,
    onBack: () -> Unit,
    onDetail: () -> Unit,
    onContinue: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "위치별 예비분석", onBack = onBack)
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
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
                                text = "${result.locations.size}개 위치 통합 결과 · 직원 검토 전",
                                modifier = Modifier.padding(top = 5.dp),
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
            }

            item {
                Text(
                    text = "위치별 결과",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                    color = EightyNavy,
                )
            }

            items(result.locations) { location ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = location.locationName,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Black,
                        )
                        Text(
                            text = "${location.grade} · ${location.gradeTitle}",
                            color = if (location.grade in listOf("D", "E")) EightyDanger else EightyBlue,
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                    Text(
                        text = location.summary,
                        modifier = Modifier.padding(top = 8.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = EightyMuted,
                    )
                    location.findings
                        .filter { it.level != FindingLevel.GOOD }
                        .take(3)
                        .forEachIndexed { index, finding ->
                            if (index == 0) Spacer(modifier = Modifier.height(10.dp))
                            Row(
                                modifier = Modifier.padding(top = if (index == 0) 0.dp else 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                FindingStatus(level = finding.level)
                                Text(
                                    text = finding.title,
                                    modifier = Modifier.padding(start = 9.dp),
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                }
            }

            item {
                PrimaryButton(text = "위치별 상세 결과 보기", onClick = onDetail)
                Spacer(modifier = Modifier.height(10.dp))
                SecondaryButton(text = "증상 입력·직원 검토 계속", onClick = onContinue)
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }
}

@Composable
fun EmployeeDetailResultScreen(
    result: DiagnosisResult,
    onBack: () -> Unit,
    onContinue: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "위치별 상세 결과", onBack = onBack)
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            items(result.locations) { location ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = location.locationName,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Black,
                            color = EightyNavy,
                        )
                        Text(
                            text = location.grade,
                            style = MaterialTheme.typography.titleLarge,
                            color = if (location.grade in listOf("D", "E")) EightyDanger else EightyBlue,
                            fontWeight = FontWeight.Black,
                        )
                    }
                    Text(
                        text = location.gradeTitle,
                        modifier = Modifier.padding(top = 3.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = EightyMuted,
                    )
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                    location.findings.forEachIndexed { index, finding ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = finding.title,
                                modifier = Modifier.weight(1f),
                                fontWeight = FontWeight.ExtraBold,
                            )
                            FindingStatus(level = finding.level)
                        }
                        Text(
                            text = finding.summary,
                            modifier = Modifier.padding(top = 6.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyMuted,
                        )
                        Text(
                            text = "권장 확인: ${finding.recommendation}",
                            modifier = Modifier.padding(top = 5.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = EightyBlue,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (index != location.findings.lastIndex) {
                            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                        }
                    }
                }
            }
            item {
                PrimaryButton(text = "위치별 증상 입력", onClick = onContinue)
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }
}
