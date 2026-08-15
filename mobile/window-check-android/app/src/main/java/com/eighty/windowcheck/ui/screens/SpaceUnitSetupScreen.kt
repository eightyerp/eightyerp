package com.eighty.windowcheck.ui.screens

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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.eighty.windowcheck.model.WindowLocation
import com.eighty.windowcheck.ui.components.AppHeader
import com.eighty.windowcheck.ui.components.PrimaryButton
import com.eighty.windowcheck.ui.components.SectionCard
import com.eighty.windowcheck.ui.theme.EightyBlue
import com.eighty.windowcheck.ui.theme.EightyDanger
import com.eighty.windowcheck.ui.theme.EightyMuted
import com.eighty.windowcheck.ui.theme.EightyNavy
import com.eighty.windowcheck.ui.theme.EightySky

private val defaultSpaces = listOf(
    "거실",
    "안방",
    "작은방 1",
    "작은방 2",
    "주방",
    "다용도실",
    "전면 발코니",
    "후면 발코니",
    "확장방",
)

private fun normalizedSpace(location: WindowLocation): String =
    location.spaceName.ifBlank { location.name.substringBefore(" · ").trim() }

private fun normalizedUnit(location: WindowLocation): String =
    location.unitName.ifBlank {
        location.name.substringAfter(" · ", missingDelimiterValue = "창호 1").trim()
    }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SpaceUnitSetupScreen(
    locations: List<WindowLocation>,
    onLocationsChange: (List<WindowLocation>) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    val selectedSpaces = locations.map(::normalizedSpace).toSet()
    val unitInputs = remember { mutableStateMapOf<String, String>() }
    var customSpace by remember { mutableStateOf("") }

    fun addSpace(spaceName: String) {
        val clean = spaceName.trim()
        if (clean.isBlank() || clean in selectedSpaces) return
        onLocationsChange(
            locations + WindowLocation(
                id = "unit_${System.currentTimeMillis()}",
                name = "$clean · 창호 1",
                spaceName = clean,
                unitName = "창호 1",
            ),
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "공간·개별 창호 등록", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            Text(
                text = "공간을 선택하고\n각 공간의 창호를 따로 등록해 주세요.",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = EightyNavy,
            )
            Text(
                text = "거실에 창이 두 개면 ‘거실 · 분합창’, ‘거실 · 확장창’처럼 각각 등록됩니다. 사진·증상·리포트도 개별 창호별로 구분됩니다.",
                modifier = Modifier.padding(top = 8.dp, bottom = 18.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = EightyMuted,
            )

            SectionCard {
                Text("공간 선택", fontWeight = FontWeight.ExtraBold)
                FlowRow(
                    modifier = Modifier.padding(top = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    defaultSpaces.forEach { space ->
                        val selected = space in selectedSpaces
                        FilterChip(
                            selected = selected,
                            onClick = {
                                if (selected) {
                                    onLocationsChange(locations.filterNot { normalizedSpace(it) == space })
                                } else {
                                    addSpace(space)
                                }
                            },
                            label = { Text(space, fontWeight = FontWeight.SemiBold) },
                        )
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = customSpace,
                        onValueChange = { customSpace = it.take(20) },
                        modifier = Modifier.weight(1f),
                        label = { Text("기타 공간명") },
                        singleLine = true,
                    )
                    Button(
                        onClick = {
                            addSpace(customSpace)
                            customSpace = ""
                        },
                        enabled = customSpace.isNotBlank(),
                        modifier = Modifier.height(56.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text("추가", fontWeight = FontWeight.Bold)
                    }
                }
            }

            val grouped = locations.groupBy(::normalizedSpace)
            grouped.entries.forEachIndexed { spaceIndex, (space, units) ->
                SectionCard(modifier = Modifier.padding(top = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .background(EightySky, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("${spaceIndex + 1}", color = EightyBlue, fontWeight = FontWeight.Black)
                        }
                        Column(modifier = Modifier.padding(start = 12.dp).weight(1f)) {
                            Text(space, fontWeight = FontWeight.Black)
                            Text(
                                "${units.size}개 창호",
                                style = MaterialTheme.typography.bodySmall,
                                color = EightyMuted,
                            )
                        }
                        TextButton(
                            onClick = {
                                onLocationsChange(locations.filterNot { normalizedSpace(it) == space })
                            },
                        ) {
                            Text("공간 삭제", color = EightyDanger)
                        }
                    }

                    units.sortedBy { it.name }.forEachIndexed { unitIndex, unit ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 10.dp)
                                .background(EightySky, RoundedCornerShape(14.dp))
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "${unitIndex + 1}. ${normalizedUnit(unit)}",
                                modifier = Modifier.weight(1f),
                                fontWeight = FontWeight.SemiBold,
                            )
                            TextButton(
                                onClick = {
                                    onLocationsChange(locations.filterNot { it.id == unit.id })
                                },
                            ) {
                                Text("삭제", color = EightyDanger)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedTextField(
                            value = unitInputs[space].orEmpty(),
                            onValueChange = { unitInputs[space] = it.take(24) },
                            modifier = Modifier.weight(1f),
                            label = { Text("예: 분합창, 확장창") },
                            singleLine = true,
                        )
                        Button(
                            onClick = {
                                val unitName = unitInputs[space].orEmpty().trim()
                                if (unitName.isNotBlank()) {
                                    onLocationsChange(
                                        locations + WindowLocation(
                                            id = "unit_${System.currentTimeMillis()}",
                                            name = "$space · $unitName",
                                            spaceName = space,
                                            unitName = unitName,
                                        ),
                                    )
                                    unitInputs[space] = ""
                                }
                            },
                            enabled = unitInputs[space].orEmpty().isNotBlank(),
                            modifier = Modifier.height(56.dp),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Text("창호 추가", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(18.dp))
            PrimaryButton(
                text = "${locations.size}개 개별 창호 촬영 준비",
                onClick = onNext,
                enabled = locations.isNotEmpty(),
            )
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}
