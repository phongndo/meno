{
  description = "Meno Electron development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    hk = {
      url = "github:jdx/hk/v1.51.0";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { hk, nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      formatter = forAllSystems (system: (import nixpkgs { inherit system; }).nixfmt);

      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          linuxLibraries = with pkgs; [
            alsa-lib
            at-spi2-atk
            atk
            cairo
            cups
            dbus
            expat
            glib
            gtk3
            libdrm
            libxkbcommon
            mesa
            nspr
            nss
            pango
            systemd
            xorg.libX11
            xorg.libXcomposite
            xorg.libXdamage
            xorg.libXext
            xorg.libXfixes
            xorg.libXrandr
          ];
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              actionlint
              git
              hk.packages.${system}.default
              nixfmt
              nodejs_24
              pkg-config
              pnpm
            ];

            LD_LIBRARY_PATH = pkgs.lib.optionalString pkgs.stdenv.isLinux (
              pkgs.lib.makeLibraryPath linuxLibraries
            );
          };
        }
      );
    };
}
