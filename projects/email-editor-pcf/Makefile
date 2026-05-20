# ─────────────────────────────────────────────
#  Maqsad Email Editor PCF — build & deploy
# ─────────────────────────────────────────────
CONTROL_DIR := EmailEditorControl
PUBLISHER   := maq

.PHONY: install build test push solution-build deploy clean

## Install npm dependencies
install:
	cd $(CONTROL_DIR) && npm install

## Build the PCF control
build:
	cd $(CONTROL_DIR) && npm run build

## Run Vitest unit tests
test:
	cd $(CONTROL_DIR) && npm test

## Dev-loop: push directly to authenticated environment (no solution zip needed)
push: build
	pac pcf push --publisher-prefix $(PUBLISHER)

## Build the full solution zip (requires msbuild + NuGet restore)
solution-build:
	msbuild /t:build /restore /p:Configuration=Release

## Import the solution zip into the authenticated environment
deploy: solution-build
	pac solution import \
		--path bin/Release/MaqsadEmailEditor.zip \
		--activate-plugins \
		--force-overwrite

## Wipe all build artefacts
clean:
	cd $(CONTROL_DIR) && npm run clean
	rm -rf bin obj
