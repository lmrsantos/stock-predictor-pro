# Quant Moment favorites swipe and quote cleanup

## Changes
- Replace the always-visible X beside each favorite ticker with a mobile swipe-left interaction.
- Keep tapping the main ticker row opening that ticker as it does now.
- Reveal a clear red delete action behind the row during a left swipe, with restrained movement and a threshold so normal taps or small finger movements do not remove anything.
- Require tapping the revealed delete action to remove the ticker, preventing accidental deletion.
- Allow the row to close again by swiping right or interacting elsewhere.
- Update the short note above the list so users know they can swipe left to remove a ticker.
- Remove only the “as of [date]” text beside the sector in the selected-symbol summary; keep the sector itself, company name, regular price, and after-hours information unchanged.

## Technical details
- Add pointer/touch gesture state to each favorites row and use pointer capture for consistent phone behavior.
- Keep movement horizontal, clamp the revealed action width, and suppress ticker selection after a completed swipe.
- Use the existing semantic colors and button control for the revealed delete action.
- Verify with a phone-sized browser that tap-to-open, swipe reveal, delete, and the simplified sector display all work without horizontal page scrolling.
