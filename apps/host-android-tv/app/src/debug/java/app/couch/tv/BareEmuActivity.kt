package app.couch.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import com.swordfish.libretrodroid.GLRetroView
import com.swordfish.libretrodroid.GLRetroViewData
import com.swordfish.libretrodroid.ShaderConfig

/** adb shell am start -n app.couch.tv/.BareEmuActivity --es core <name> --es rom <path> */
class BareEmuActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as CouchApp
        val data = GLRetroViewData(this).apply {
            coreFilePath = app.cores.ensure(intent.getStringExtra("core")!!)
            gameFilePath = intent.getStringExtra("rom")
            systemDirectory = app.library.systemDir().absolutePath
            savesDirectory = filesDir.absolutePath
            shader = ShaderConfig.Default
        }
        val view = GLRetroView(this, data)
        lifecycle.addObserver(view)
        setContentView(view)
    }
}
