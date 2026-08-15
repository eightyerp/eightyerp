package com.eighty.windowcheck.data.local

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

@Entity(tableName = "inspection_drafts")
data class InspectionDraftEntity(
    @PrimaryKey val id: Int = 1,
    val payloadJson: String,
    val updatedAt: Long = System.currentTimeMillis(),
)

@Dao
interface InspectionDraftDao {
    @Query("SELECT * FROM inspection_drafts WHERE id = 1 LIMIT 1")
    suspend fun get(): InspectionDraftEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun save(entity: InspectionDraftEntity)

    @Query("DELETE FROM inspection_drafts")
    suspend fun clear()
}

@Database(
    entities = [InspectionDraftEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class WindowCheckDatabase : RoomDatabase() {
    abstract fun inspectionDraftDao(): InspectionDraftDao

    companion object {
        @Volatile
        private var instance: WindowCheckDatabase? = null

        fun get(context: Context): WindowCheckDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    WindowCheckDatabase::class.java,
                    "eighty-window-check.db",
                ).build().also { instance = it }
            }
    }
}
