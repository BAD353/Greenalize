import React, { Suspense, useState } from "react";

const Sidebar = ({ onClose }: { onClose: Function }) => {
    return (
        <div style={styles.container}>
            <div style={styles.closeButtonContainer}>
                <img
                    src="/assets/icons/close.svg"
                    style={styles.closeButton}
                    onClick={() => {
                        onClose();
                    }}
                />
            </div>
            nothing to see here!
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    container: {
        position: "absolute",
        top: "0",
        left: "0",
        display: "flex",
        flexDirection:'column',
        height: "100vh",
        boxSizing: "border-box",
        gap: "1rem",
        borderRight: "2px solid var(--button-enabled)",
        borderBottom: "2px solid var(--button-enabled)",
        background: "#fff",
        padding: "1rem 1rem",
        borderBottomRightRadius: "10px",
        zIndex: "100",
    },
    closeButton: {
        width: "32px",
        height: "32px",
        cursor: "pointer",
    },
    closeButtonContainer: {
        width:'100%',
        height:'32px',
        display:'flex',
        flexDirection:'row-reverse',
    },
};
export default Sidebar;
