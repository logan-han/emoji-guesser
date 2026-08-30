package com.emojiguesser.audio

import com.emojiguesser.R

enum class SoundEvent(val resId: Int) {
    ButtonClick(R.raw.button_click),
    CorrectGuess(R.raw.correct_guess),
    EmojiSelect(R.raw.emoji_select),
    GameEnd(R.raw.game_end),
    GameStart(R.raw.game_start),
    NewGuess(R.raw.new_guess),
    PlayerJoined(R.raw.player_joined),
    TimeUp(R.raw.time_up)
}
