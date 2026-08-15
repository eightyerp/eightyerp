package com.eighty.windowcheck.data.local

import android.net.Uri
import com.eighty.windowcheck.model.CaptureType
import com.eighty.windowcheck.model.CapturedPhoto
import com.eighty.windowcheck.model.CustomerInfo
import com.eighty.windowcheck.model.EvidencePhoto
import com.eighty.windowcheck.model.EvidenceType
import com.eighty.windowcheck.model.InspectionSetup
import com.eighty.windowcheck.model.InspectorInfo
import com.eighty.windowcheck.model.LocationCondition
import com.eighty.windowcheck.model.StaffReview
import com.eighty.windowcheck.model.WindowLocation
import org.json.JSONArray
import org.json.JSONObject

data class InspectionDraftSnapshot(
    val setup: InspectionSetup,
    val locations: List<WindowLocation>,
    val photos: List<CapturedPhoto>,
    val evidencePhotos: List<EvidencePhoto>,
    val conditions: List<LocationCondition>,
    val review: StaffReview,
)

object InspectionDraftCodec {
    fun encode(snapshot: InspectionDraftSnapshot): String = JSONObject().apply {
        put("setup", JSONObject().apply {
            put("customer", JSONObject().apply {
                put("name", snapshot.setup.customer.name)
                put("phone", snapshot.setup.customer.phone)
                put("address", snapshot.setup.customer.address)
                put("detailAddress", snapshot.setup.customer.detailAddress)
            })
            put("inspector", JSONObject().apply {
                put("name", snapshot.setup.inspector.name)
                put("teamPosition", snapshot.setup.inspector.teamPosition)
                put("phone", snapshot.setup.inspector.phone)
            })
        })
        put("locations", JSONArray().apply {
            snapshot.locations.forEach { location ->
                put(JSONObject().apply {
                    put("id", location.id)
                    put("name", location.name)
                    put("note", location.note)
                    put("spaceName", location.spaceName)
                    put("unitName", location.unitName)
                })
            }
        })
        put("photos", JSONArray().apply {
            snapshot.photos.forEach { photo ->
                put(JSONObject().apply {
                    put("locationId", photo.locationId)
                    put("locationName", photo.locationName)
                    put("type", photo.type.name)
                    put("uri", photo.uri.toString())
                    put("sequence", photo.sequence)
                    put("description", photo.description)
                })
            }
        })
        put("evidencePhotos", JSONArray().apply {
            snapshot.evidencePhotos.forEach { photo ->
                put(JSONObject().apply {
                    put("locationId", photo.locationId)
                    put("locationName", photo.locationName)
                    put("type", photo.type.name)
                    put("uri", photo.uri.toString())
                    put("sequence", photo.sequence)
                    put("description", photo.description)
                })
            }
        })
        put("conditions", JSONArray().apply {
            snapshot.conditions.forEach { condition ->
                put(JSONObject().apply {
                    put("locationId", condition.locationId)
                    put("locationName", condition.locationName)
                    put("yearsInUse", condition.yearsInUse)
                    put("draftLevel", condition.draftLevel)
                    put("condensation", condition.condensation)
                    put("condensationArea", condition.condensationArea)
                    put("exteriorLeak", condition.exteriorLeak)
                    put("leakArea", condition.leakArea)
                    put("openingCondition", condition.openingCondition)
                    put("noiseLevel", condition.noiseLevel)
                    put("moldCondition", condition.moldCondition)
                    put("otherIssue", condition.otherIssue)
                })
            }
        })
        put("review", JSONObject().apply {
            put("recommendation", snapshot.review.recommendation)
            put("customerComment", snapshot.review.customerComment)
            put("internalMemo", snapshot.review.internalMemo)
            put("correctionType", snapshot.review.correctionType)
            put("quoteRequired", snapshot.review.quoteRequired)
            put("measurementRequired", snapshot.review.measurementRequired)
            put("revisitRequired", snapshot.review.revisitRequired)
            put("confirmed", snapshot.review.confirmed)
        })
    }.toString()

    fun decode(payload: String): InspectionDraftSnapshot {
        val root = JSONObject(payload)
        val setupJson = root.optJSONObject("setup") ?: JSONObject()
        val customerJson = setupJson.optJSONObject("customer") ?: JSONObject()
        val inspectorJson = setupJson.optJSONObject("inspector") ?: JSONObject()

        return InspectionDraftSnapshot(
            setup = InspectionSetup(
                customer = CustomerInfo(
                    name = customerJson.optString("name"),
                    phone = customerJson.optString("phone"),
                    address = customerJson.optString("address"),
                    detailAddress = customerJson.optString("detailAddress"),
                ),
                inspector = InspectorInfo(
                    name = inspectorJson.optString("name"),
                    teamPosition = inspectorJson.optString("teamPosition"),
                    phone = inspectorJson.optString("phone"),
                ),
            ),
            locations = root.optJSONArray("locations").mapObjects { item ->
                WindowLocation(
                    id = item.optString("id"),
                    name = item.optString("name"),
                    note = item.optString("note"),
                    spaceName = item.optString("spaceName"),
                    unitName = item.optString("unitName"),
                )
            },
            photos = root.optJSONArray("photos").mapObjects { item ->
                CapturedPhoto(
                    locationId = item.optString("locationId"),
                    locationName = item.optString("locationName"),
                    type = CaptureType.valueOf(item.optString("type")),
                    uri = Uri.parse(item.optString("uri")),
                    sequence = item.optInt("sequence"),
                    description = item.optString("description"),
                )
            },
            evidencePhotos = root.optJSONArray("evidencePhotos").mapObjects { item ->
                EvidencePhoto(
                    locationId = item.optString("locationId"),
                    locationName = item.optString("locationName"),
                    type = EvidenceType.valueOf(item.optString("type")),
                    uri = Uri.parse(item.optString("uri")),
                    sequence = item.optInt("sequence"),
                    description = item.optString("description"),
                )
            },
            conditions = root.optJSONArray("conditions").mapObjects { item ->
                LocationCondition(
                    locationId = item.optString("locationId"),
                    locationName = item.optString("locationName"),
                    yearsInUse = item.optString("yearsInUse", "모름"),
                    draftLevel = item.optString("draftLevel", "보통"),
                    condensation = item.optString("condensation", "없음"),
                    condensationArea = item.optString("condensationArea", "해당 없음"),
                    exteriorLeak = item.optString("exteriorLeak", "없음"),
                    leakArea = item.optString("leakArea", "해당 없음"),
                    openingCondition = item.optString("openingCondition", "보통"),
                    noiseLevel = item.optString("noiseLevel", "보통"),
                    moldCondition = item.optString("moldCondition", "없음"),
                    otherIssue = item.optString("otherIssue"),
                )
            },
            review = (root.optJSONObject("review") ?: JSONObject()).let { item ->
                StaffReview(
                    recommendation = item.optString("recommendation", "부분 보수 점검"),
                    customerComment = item.optString("customerComment"),
                    internalMemo = item.optString("internalMemo"),
                    correctionType = item.optString("correctionType", "partially_corrected"),
                    quoteRequired = item.optBoolean("quoteRequired"),
                    measurementRequired = item.optBoolean("measurementRequired"),
                    revisitRequired = item.optBoolean("revisitRequired"),
                    confirmed = item.optBoolean("confirmed"),
                )
            },
        )
    }

    private fun <T> JSONArray?.mapObjects(transform: (JSONObject) -> T): List<T> {
        if (this == null) return emptyList()
        return buildList {
            for (index in 0 until length()) {
                optJSONObject(index)?.let { add(transform(it)) }
            }
        }
    }
}
