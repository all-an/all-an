namespace Attendance_System
{
    partial class RegisterFrm
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.TxtUSer = new MetroFramework.Controls.MetroTextBox();
            this.TxtPass1 = new MetroFramework.Controls.MetroTextBox();
            this.Txtpass2 = new MetroFramework.Controls.MetroTextBox();
            this.metroLabel1 = new MetroFramework.Controls.MetroLabel();
            this.metroLabel2 = new MetroFramework.Controls.MetroLabel();
            this.metroLabel3 = new MetroFramework.Controls.MetroLabel();
            this.metroButton1 = new MetroFramework.Controls.MetroButton();
            this.SuspendLayout();
            // 
            // TxtUSer
            // 
            this.TxtUSer.Location = new System.Drawing.Point(35, 44);
            this.TxtUSer.Name = "TxtUSer";
            this.TxtUSer.Size = new System.Drawing.Size(279, 23);
            this.TxtUSer.TabIndex = 0;
            // 
            // TxtPass1
            // 
            this.TxtPass1.Location = new System.Drawing.Point(35, 118);
            this.TxtPass1.Name = "TxtPass1";
            this.TxtPass1.PasswordChar = '*';
            this.TxtPass1.Size = new System.Drawing.Size(279, 23);
            this.TxtPass1.TabIndex = 1;
            // 
            // Txtpass2
            // 
            this.Txtpass2.Location = new System.Drawing.Point(35, 164);
            this.Txtpass2.Name = "Txtpass2";
            this.Txtpass2.PasswordChar = '*';
            this.Txtpass2.Size = new System.Drawing.Size(279, 23);
            this.Txtpass2.TabIndex = 2;
            // 
            // metroLabel1
            // 
            this.metroLabel1.AutoSize = true;
            this.metroLabel1.Location = new System.Drawing.Point(35, 19);
            this.metroLabel1.Name = "metroLabel1";
            this.metroLabel1.Size = new System.Drawing.Size(82, 19);
            this.metroLabel1.TabIndex = 3;
            this.metroLabel1.Text = "User Name: ";
            // 
            // metroLabel2
            // 
            this.metroLabel2.AutoSize = true;
            this.metroLabel2.Location = new System.Drawing.Point(35, 96);
            this.metroLabel2.Name = "metroLabel2";
            this.metroLabel2.Size = new System.Drawing.Size(70, 19);
            this.metroLabel2.TabIndex = 4;
            this.metroLabel2.Text = "Password: ";
            // 
            // metroLabel3
            // 
            this.metroLabel3.AutoSize = true;
            this.metroLabel3.Location = new System.Drawing.Point(35, 144);
            this.metroLabel3.Name = "metroLabel3";
            this.metroLabel3.Size = new System.Drawing.Size(64, 19);
            this.metroLabel3.TabIndex = 5;
            this.metroLabel3.Text = "Confirm: ";
            // 
            // metroButton1
            // 
            this.metroButton1.Location = new System.Drawing.Point(239, 204);
            this.metroButton1.Name = "metroButton1";
            this.metroButton1.Size = new System.Drawing.Size(75, 23);
            this.metroButton1.TabIndex = 6;
            this.metroButton1.Text = "Accept";
            this.metroButton1.Click += new System.EventHandler(this.metroButton1_Click);
            // 
            // RegisterFrm
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.White;
            this.ClientSize = new System.Drawing.Size(353, 254);
            this.Controls.Add(this.metroButton1);
            this.Controls.Add(this.metroLabel3);
            this.Controls.Add(this.metroLabel2);
            this.Controls.Add(this.metroLabel1);
            this.Controls.Add(this.Txtpass2);
            this.Controls.Add(this.TxtPass1);
            this.Controls.Add(this.TxtUSer);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedToolWindow;
            this.Name = "RegisterFrm";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "Register";
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private MetroFramework.Controls.MetroTextBox TxtUSer;
        private MetroFramework.Controls.MetroTextBox TxtPass1;
        private MetroFramework.Controls.MetroTextBox Txtpass2;
        private MetroFramework.Controls.MetroLabel metroLabel1;
        private MetroFramework.Controls.MetroLabel metroLabel2;
        private MetroFramework.Controls.MetroLabel metroLabel3;
        private MetroFramework.Controls.MetroButton metroButton1;
    }
}