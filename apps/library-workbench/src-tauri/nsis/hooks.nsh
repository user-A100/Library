; Explorer context menu: "Open with Library" on folders and folder backgrounds.
; The GUI binary accepts a bare folder path argument
; (features/open_request::collect_open_args), which is lossless for paths with
; spaces, `&`, `%` or non-ASCII characters (a deep-link URL query would not be).
; Keys go under SHCTX so they follow the installer mode (currentUser → HKCU).

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Right-click on a folder
  WriteRegStr SHCTX "Software\Classes\Directory\shell\OpenWithLibrary" "" "Open with Library"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\OpenWithLibrary" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\OpenWithLibrary\command" "" `$"$INSTDIR\${MAINBINARYNAME}.exe$" $\"%1$\"`
  ; Right-click on the empty area inside a folder
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\OpenWithLibrary" "" "Open with Library"
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\OpenWithLibrary" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\OpenWithLibrary\command" "" `$"$INSTDIR\${MAINBINARYNAME}.exe$" $\"%V$\"`
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Ownership-guarded cleanup (mirrors the upstream deep-link removal): only
  ; delete entries whose command still points at this install location.
  ReadRegStr $R0 SHCTX "Software\Classes\Directory\shell\OpenWithLibrary\command" ""
  StrCmp $R0 `$"$INSTDIR\${MAINBINARYNAME}.exe$" $\"%1$\"` 0 +2
    DeleteRegKey SHCTX "Software\Classes\Directory\shell\OpenWithLibrary"
  ReadRegStr $R0 SHCTX "Software\Classes\Directory\Background\shell\OpenWithLibrary\command" ""
  StrCmp $R0 `$"$INSTDIR\${MAINBINARYNAME}.exe$" $\"%V$\"` 0 +2
    DeleteRegKey SHCTX "Software\Classes\Directory\Background\shell\OpenWithLibrary"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
