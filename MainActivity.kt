package com.nova.downloader

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Background = Color(0xFF090B16)
private val Panel = Color(0xFF14182A)
private val Purple = Color(0xFF8B5CF6)
private val Cyan = Color(0xFF22D3EE)
private val Muted = Color(0xFF9AA3B8)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { NovaApp() }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NovaApp() {
    var url by remember { mutableStateOf("") }
    var format by remember { mutableStateOf("MP4") }
    var quality by remember { mutableStateOf("1080p") }
    var expandedFormat by remember { mutableStateOf(false) }
    var expandedQuality by remember { mutableStateOf(false) }
    var downloads by remember { mutableStateOf(listOf<String>()) }

    MaterialTheme(colorScheme = darkColorScheme(
        background = Background, surface = Panel, primary = Purple,
        secondary = Cyan, onBackground = Color.White, onSurface = Color.White
    )) {
        Scaffold(containerColor = Background) { padding ->
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 20.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp)
            ) {
                item {
                    Spacer(Modifier.height(22.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(48.dp).background(
                                Brush.linearGradient(listOf(Purple, Cyan)),
                                RoundedCornerShape(15.dp)
                            ), contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.bolt, null, tint = Color.White, modifier = Modifier.size(30.dp))
                        }
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("NOVA", fontSize = 25.sp, fontWeight = FontWeight.Black, letterSpacing = 3.sp)
                            Text("DOWNLOADER", color = Cyan, fontSize = 10.sp, letterSpacing = 3.sp)
                        }
                        Spacer(Modifier.weight(1f))
                        Icon(Icons.Default.settings, "Settings", tint = Muted)
                    }
                }
                item {
                    Column {
                        Text("حمّل ما تريد.", fontSize = 27.sp, fontWeight = FontWeight.Bold)
                        Text("الصق رابط الفيديو واختر الصيغة والجودة", color = Muted, fontSize = 13.sp)
                    }
                }
                item {
                    Column(Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(22.dp)).padding(18.dp)) {
                        Text("رابط الفيديو", color = Color.White, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = url, onValueChange = { url = it },
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = { Text("https://example.com/video", color = Muted) },
                            leadingIcon = { Icon(Icons.Default.Link, null, tint = Cyan) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Purple, unfocusedBorderColor = Color(0xFF30364D)
                            )
                        )
                        Spacer(Modifier.height(14.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.weight(1f)) {
                                ExposedDropdownMenuBox(expanded = expandedFormat, onExpandedChange = { expandedFormat = !expandedFormat }) {
                                    OutlinedTextField(
                                        value = format, onValueChange = {}, readOnly = true,
                                        label = { Text("الصيغة") }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expandedFormat) },
                                        modifier = Modifier.menuAnchor().fillMaxWidth(), shape = RoundedCornerShape(13.dp)
                                    )
                                    ExposedDropdownMenu(expanded = expandedFormat, onDismissRequest = { expandedFormat = false }) {
                                        listOf("MP4", "MP3", "WEBM").forEach { DropdownMenuItem(text = { Text(it) }, onClick = { format = it; expandedFormat = false }) }
                                    }
                                }
                            }
                            Box(Modifier.weight(1f)) {
                                ExposedDropdownMenuBox(expanded = expandedQuality, onExpandedChange = { expandedQuality = !expandedQuality }) {
                                    OutlinedTextField(
                                        value = quality, onValueChange = {}, readOnly = true,
                                        label = { Text("الجودة") }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expandedQuality) },
                                        modifier = Modifier.menuAnchor().fillMaxWidth(), shape = RoundedCornerShape(13.dp)
                                    )
                                    ExposedDropdownMenu(expanded = expandedQuality, onDismissRequest = { expandedQuality = false }) {
                                        listOf("360p", "480p", "720p", "1080p", "صوت فقط").forEach { DropdownMenuItem(text = { Text(it) }, onClick = { quality = it; expandedQuality = false }) }
                                    }
                                }
                            }
                        }
                        Spacer(Modifier.height(18.dp))
                        Button(
                            onClick = { if (url.isNotBlank()) { downloads = listOf("$format • $quality • $url") + downloads; url = "" } },
                            modifier = Modifier.fillMaxWidth().height(54.dp),
                            shape = RoundedCornerShape(15.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Purple)
                        ) {
                            Icon(Icons.Default.download, null)
                            Spacer(Modifier.width(8.dp))
                            Text("إضافة إلى قائمة التحميل", fontWeight = FontWeight.Bold)
                        }
                        Text("واجهة أولية: زر الإضافة ينشئ عنصراً تجريبياً ولا يبدأ تنزيل ملف فعلي.", color = Muted, fontSize = 10.sp)
                    }
                }
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("التحميلات", fontSize = 19.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.weight(1f))
                        Text("${downloads.size} عناصر", color = Cyan, fontSize = 12.sp)
                    }
                }
                if (downloads.isEmpty()) {
                    item {
                        Column(
                            Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(18.dp)).padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(Icons.Default.folderOpen, null, tint = Purple, modifier = Modifier.size(34.dp))
                            Spacer(Modifier.height(8.dp))
                            Text("لا توجد تحميلات بعد", color = Color.White, fontWeight = FontWeight.SemiBold)
                            Text("ستظهر العناصر التي تضيفها هنا", color = Muted, fontSize = 12.sp)
                        }
                    }
                } else {
                    items(downloads) { item ->
                        Row(
                            Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(15.dp)).padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.videoFile, null, tint = Cyan)
                            Spacer(Modifier.width(10.dp))
                            Text(item, modifier = Modifier.weight(1f), fontSize = 12.sp, maxLines = 2, color = Color.White)
                            IconButton(onClick = { downloads = downloads - item }) {
                                Icon(Icons.Default.close, "Remove", tint = Muted)
                            }
                        }
                    }
                }
                item {
                    Text(
                        "NOVA Downloader  •  إصدار تجريبي",
                        color = Color(0xFF65708A), fontSize = 11.sp,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 18.dp)
                    )
                }
            }
        }
    }
}
