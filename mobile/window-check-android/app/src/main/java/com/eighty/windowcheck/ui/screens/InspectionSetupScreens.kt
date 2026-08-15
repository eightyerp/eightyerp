package com.eighty.windowcheck.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.eighty.windowcheck.model.CustomerInfo
import com.eighty.windowcheck.model.InspectionSetup
import com.eighty.windowcheck.model.InspectorInfo
import com.eighty.windowcheck.model.WindowLocation
import com.eighty.windowcheck.ui.components.AppHeader
import com.eighty.windowcheck.ui.components.PrimaryButton
import com.eighty.windowcheck.ui.components.SectionCard
import com.eighty.windowcheck.ui.theme.EightyMuted
import com.eighty.windowcheck.ui.theme.EightyNavy

@Composable
fun InspectionSetupScreen(
    setup: InspectionSetup,
    onSetupChange: (InspectionSetup) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "직원 점검 시작", onBack = onBack)
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                horizontal = 20.dp,
                vertical = 10.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Text(
                    text = "고객과 담당자 정보를 입력하면\n점검 리포트에 자동으로 표시됩니다.",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Black,
                    color = EightyNavy,
                )
                Text(
                    text = "고객에게 전달할 문서이므로 이름과 현장주소를 확인해 주세요.",
                    modifier = Modifier.padding(top = 8.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = EightyMuted,
                )
            }

            item {
                SectionCard {
                    Text(
                        text = "점검 담당자",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    FormField(
                        label = "직원명 *",
                        value = setup.inspector.name,
                        onValueChange = {
                            onSetupChange(
                                setup.copy(inspector = setup.inspector.copy(name = it)),
                            )
                        },
                    )
                    FormField(
                        label = "팀·직급",
                        value = setup.inspector.teamPosition,
                        onValueChange = {
                            onSetupChange(
                                setup.copy(inspector = setup.inspector.copy(teamPosition = it)),
                            )
                        },
                    )
                    FormField(
                        label = "담당자 연락처",
                        value = setup.inspector.phone,
                        onValueChange = {
                            onSetupChange(
                                setup.copy(inspector = setup.inspector.copy(phone = it)),
                            )
                        },
                    )
                }
            }

            item {
                SectionCard {
                    Text(
                        text = "고객·현장 정보",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    FormField(
                        label = "고객명 *",
                        value = setup.customer.name,
                        onValueChange = {
                            onSetupChange(
                                setup.copy(customer = setup.customer.copy(name = it)),
                            )
                        },
                    )
                    FormField(
                        label = "고객 연락처",
                        value = setup.customer.phone,
                        onValueChange = {
                            onSetupChange(
                                setup.copy(customer = setup.customer.copy(phone = it)),
                            )
                        },
                    )
                    FormField(
                        label = "아파트·현장 주소 *",
                        value = setup.customer.address,
                        onValueChange = {
                            onSetupChange(
                                setup.copy(customer = setup.customer.copy(address = it)),
                            )
                        },
                    )
                    FormField(
                        label = "동·호수 / 상세주소",
                        value = setup.customer.detailAddress,
                        onValueChange = {
                            onSetupChange(
                                setup.copy(customer = setup.customer.copy(detailAddress = it)),
                            )
                        },
                    )
                }
            }

            item {
                PrimaryButton(
                    text = "점검 위치 선택",
                    onClick = onNext,
                    enabled = setup.inspector.name.isNotBlank() &&
                        setup.customer.name.isNotBlank() &&
                        setup.customer.address.isNotBlank(),
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }
}

@Composable
private fun FormField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp),
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LocationSetupScreen(
    locations: List<WindowLocation>,
    onAddLocation: (String) -> Unit,
    onRemoveLocation: (String) -> Unit,
    onLocationNoteChange: (String, String) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    var customLocation by remember { mutableStateOf("") }
    val presets = listOf(
        "거실",
        "안방",
        "작은방 1",
        "작은방 2",
        "주방",
        "다용도실",
        "전면 발코니",
        "후면 발코니",
    )

    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "점검 위치 선택", onBack = onBack)
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                horizontal = 20.dp,
                vertical = 10.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(
                    text = "창호가 있는 위치를\n모두 추가해 주세요.",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Black,
                    color = EightyNavy,
                )
                Text(
                    text = "각 위치마다 기본 사진 5장과 결로·누수·기타 증상 사진을 따로 촬영합니다.",
                    modifier = Modifier.padding(top = 8.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = EightyMuted,
                )
            }

            item {
                SectionCard {
                    Text(
                        text = "빠른 위치 추가",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    FlowRow(
                        modifier = Modifier.padding(top = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        presets.forEach { preset ->
                            val selected = locations.any { it.name == preset }
                            FilterChip(
                                selected = selected,
                                onClick = {
                                    if (selected) {
                                        locations.firstOrNull { it.name == preset }?.let {
                                            onRemoveLocation(it.id)
                                        }
                                    } else {
                                        onAddLocation(preset)
                                    }
                                },
                                label = { Text(preset, fontWeight = FontWeight.SemiBold) },
                            )
                        }
                    }
                    Row(
                        modifier = Modifier.padding(top = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = customLocation,
                            onValueChange = { customLocation = it },
                            modifier = Modifier.weight(1f),
                            label = { Text("기타 위치") },
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                        )
                        Button(
                            onClick = {
                                val name = customLocation.trim()
                                if (name.isNotEmpty()) {
                                    onAddLocation(name)
                                    customLocation = ""
                                }
                            },
                            enabled = customLocation.isNotBlank(),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Text("추가", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            item {
                Text(
                    text = "선택한 위치 ${locations.size}곳",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                )
            }

            items(locations, key = { it.id }) { location ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = location.name,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Black,
                        )
                        TextButton(onClick = { onRemoveLocation(location.id) }) {
                            Text("삭제")
                        }
                    }
                    OutlinedTextField(
                        value = location.note,
                        onValueChange = { onLocationNoteChange(location.id, it) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        label = { Text("위치 메모 (예: 거실 확장부 큰창)") },
                        minLines = 2,
                        shape = RoundedCornerShape(14.dp),
                    )
                }
            }

            item {
                PrimaryButton(
                    text = if (locations.isEmpty()) {
                        "점검 위치를 추가해 주세요"
                    } else {
                        "${locations.size}개 위치 촬영 준비"
                    },
                    onClick = onNext,
                    enabled = locations.isNotEmpty(),
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }
}
